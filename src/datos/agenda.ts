import { supabase } from '../lib/supabase';
import type { EstadoMateriaDb, EventoDb, HorarioDb, TipoEvento } from '../lib/tipos-db';
import { periodoDe } from '../lib/finales';
import { db, esperar, idDemo, MODO_DEMO, UID_DEMO } from './demo';

function lanzar(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export interface Agenda {
  horario: HorarioDb[];
  eventos: EventoDb[];
  /** id de materia → nombre, para mostrar. */
  nombres: Map<string, string>;
  /** Materias del plan, en orden de la malla (para elegir cuáles cursás). */
  materias: MateriaAgenda[];
  /** Tu estado en cada materia que no está pendiente. */
  estados: Map<string, EstadoMateriaDb>;
  /** Materias que firmaste (o aprobaste) en este semestre: siguen en la agenda. */
  terminadasEsteSemestre: Set<string>;
}

export interface MateriaAgenda {
  id: string;
  nombre: string;
  semestre: number;
  optativa: boolean;
}

/**
 * Horario semanal y fechas de hoy en adelante. Las fechas son solo las que
 * carga cada estudiante, porque dependen de su situación académica.
 */
export async function cargarAgenda(planId: string | null | undefined): Promise<Agenda> {
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  let horario: HorarioDb[];
  let eventos: EventoDb[];
  type Fila = { id: string; nombre: string; semestre: number; grupo_optativa_id: string | null; orden: number };
  let filas: Fila[];
  let estados: { materia_id: string; estado: EstadoMateriaDb; updated_at?: string | null }[];
  if (MODO_DEMO) {
    await esperar();
    horario = [...db.horario];
    eventos = db.eventos.filter((e) => e.usuario_id != null && new Date(e.fecha) >= desde);
    filas = db.materias;
    estados = db.estados;
  } else {
    const [rH, rE, rM, rS] = await Promise.all([
      supabase.from('horario').select('*').order('dia_semana').order('hora_inicio'),
      supabase.from('eventos').select('*').not('usuario_id', 'is', null).gte('fecha', desde.toISOString()).order('fecha').limit(100),
      planId
        ? supabase.from('materias').select('id, nombre, semestre, grupo_optativa_id, orden').eq('plan_id', planId)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('materias_estudiante').select('materia_id, estado, updated_at'),
    ]);
    lanzar(rH.error); lanzar(rE.error); lanzar(rM.error); lanzar(rS.error);
    horario = rH.data ?? [];
    eventos = rE.data ?? [];
    filas = (rM.data ?? []) as Fila[];
    estados = (rS.data ?? []) as typeof estados;
  }
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  horario.sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio));
  const materias = [...filas]
    .sort((a, b) => a.semestre - b.semestre || a.orden - b.orden)
    .map((m) => ({ id: m.id, nombre: m.nombre, semestre: m.semestre, optativa: m.grupo_optativa_id != null }));
  return {
    horario,
    eventos,
    nombres: new Map(materias.map((m) => [m.id, m.nombre])),
    materias,
    estados: new Map(estados.filter((e) => e.estado !== 'pendiente').map((e) => [e.materia_id, e.estado])),
    terminadasEsteSemestre: new Set(estados
      .filter((e) => (e.estado === 'firmada' || e.estado === 'aprobada') && e.updated_at && periodoDe(new Date(e.updated_at)) === periodoDe())
      .map((e) => e.materia_id)),
  };
}

export type NuevaClase = Pick<HorarioDb, 'materia_id' | 'titulo' | 'dia_semana' | 'hora_inicio' | 'hora_fin' | 'aula' | 'aviso_minutos'>;

/** Agrega la misma clase en uno o varios días (p. ej. lunes y miércoles). */
export async function crearClases(clases: NuevaClase[]) {
  if (clases.length === 0) return;
  if (MODO_DEMO) {
    db.horario.push(...clases.map((c) => ({ ...c, id: idDemo(), usuario_id: UID_DEMO, avisado_el: null })));
    return;
  }
  const { error } = await supabase.from('horario').insert(clases);
  lanzar(error);
}

export async function actualizarClase(id: string, cambios: NuevaClase) {
  if (MODO_DEMO) {
    db.horario = db.horario.map((h) => (h.id === id ? { ...h, ...cambios } : h));
    return;
  }
  const { error } = await supabase.from('horario').update(cambios).eq('id', id);
  lanzar(error);
}

export async function borrarClase(id: string) {
  if (MODO_DEMO) {
    db.horario = db.horario.filter((h) => h.id !== id);
    return;
  }
  const { error } = await supabase.from('horario').delete().eq('id', id);
  lanzar(error);
}

export async function crearEvento(uid: string, e: { titulo: string; tipo: TipoEvento; fecha: string; materia_id: string | null }) {
  if (MODO_DEMO) {
    db.eventos.push({ ...e, id: idDemo(), usuario_id: UID_DEMO, plan_id: null, aviso_minutos: 1440, notificado: false, created_at: new Date().toISOString() });
    return;
  }
  const { error } = await supabase.from('eventos').insert({ ...e, usuario_id: uid });
  lanzar(error);
}

export async function borrarEvento(id: string) {
  if (MODO_DEMO) {
    db.eventos = db.eventos.filter((e) => e.id !== id);
    return;
  }
  const { error } = await supabase.from('eventos').delete().eq('id', id);
  lanzar(error);
}

/* ------------------------------------------------------------------ */
/* Fechas en castellano                                                */
/* ------------------------------------------------------------------ */

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 1 = lunes … 7 = domingo, como en la base. */
export const diaSemanaHoy = () => ((new Date().getDay() + 6) % 7) + 1;

export const hora = (t: string) => t.slice(0, 5);

export function fechaCorta(iso: string) {
  const f = new Date(iso);
  return `${DIAS_CORTOS[(f.getDay() + 6) % 7]} ${f.getDate()} ${MESES[f.getMonth()]}`;
}

export function horaDe(iso: string) {
  const f = new Date(iso);
  return `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
}

/** "Hoy", "Mañana", "En 5 días". */
export function cuentaRegresiva(iso: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(iso);
  f.setHours(0, 0, 0, 0);
  const dias = Math.round((f.getTime() - hoy.getTime()) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return `En ${dias} días`;
}

export function diasHasta(iso: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(iso);
  f.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - hoy.getTime()) / 86400000);
}

export function partesFecha(iso: string) {
  const f = new Date(iso);
  return { dia: String(f.getDate()), mes: MESES[f.getMonth()].toUpperCase() };
}
