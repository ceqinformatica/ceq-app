import { supabase } from '../lib/supabase';
import type { EventoDb, HorarioDb, TipoEvento } from '../lib/tipos-db';
import { db, esperar, idDemo, MODO_DEMO, UID_DEMO } from './demo';

function lanzar(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export interface Agenda {
  horario: HorarioDb[];
  eventos: EventoDb[];
  /** id de materia → nombre, para mostrar. */
  nombres: Map<string, string>;
}

/** Horario semanal y eventos de hoy en adelante (propios y oficiales del CEQ). */
export async function cargarAgenda(planId: string | null | undefined): Promise<Agenda> {
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  let horario: HorarioDb[];
  let eventos: EventoDb[];
  let nombres: [string, string][];
  if (MODO_DEMO) {
    await esperar();
    horario = [...db.horario];
    eventos = db.eventos.filter((e) => new Date(e.fecha) >= desde);
    nombres = db.materias.map((m) => [m.id, m.nombre]);
  } else {
    const [rH, rE, rM] = await Promise.all([
      supabase.from('horario').select('*').order('dia_semana').order('hora_inicio'),
      supabase.from('eventos').select('*').gte('fecha', desde.toISOString()).order('fecha').limit(100),
      planId ? supabase.from('materias').select('id, nombre').eq('plan_id', planId) : Promise.resolve({ data: [], error: null }),
    ]);
    lanzar(rH.error); lanzar(rE.error); lanzar(rM.error);
    horario = rH.data ?? [];
    eventos = (rE.data ?? []).filter((e) => e.usuario_id != null || e.plan_id == null || e.plan_id === planId);
    nombres = ((rM.data ?? []) as { id: string; nombre: string }[]).map((m) => [m.id, m.nombre]);
  }
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  horario.sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio));
  return { horario, eventos, nombres: new Map(nombres) };
}

export type NuevaClase = Pick<HorarioDb, 'materia_id' | 'titulo' | 'dia_semana' | 'hora_inicio' | 'hora_fin' | 'aula'>;

export async function crearClase(c: NuevaClase) {
  if (MODO_DEMO) {
    db.horario.push({ ...c, id: idDemo(), usuario_id: UID_DEMO });
    return;
  }
  const { error } = await supabase.from('horario').insert(c);
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
