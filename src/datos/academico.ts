/**
 * Lectura y escritura de lo académico (malla, estados, firma) para las
 * pantallas. Usa Supabase, o los datos de ejemplo en modo demostración.
 * El cálculo vive en src/lib/progreso.ts y src/lib/firma.ts.
 */
import { pesosIguales, type Asistencia, type Evaluacion, type ReglaFirma } from '../lib/firma';
import type { EstadoEstudiante, EstadoMateria, GrupoOptativas, Materia, Prerrequisito, UnidadAvance } from '../lib/progreso';
import { REGLA_FCQ } from '../lib/reglamento-fcq';
import { supabase } from '../lib/supabase';
import type { AsistenciaDb, ComponenteDb, EvaluacionDb, GrupoOptativasDb, MateriaDb, Plan, PrerrequisitoDb, ReglaFirmaDb } from '../lib/tipos-db';
import { db, esperar, idDemo, MODO_DEMO, UID_DEMO } from './demo';

export interface Malla {
  plan: Plan | null;
  carrera: string | null;
  materiasDb: MateriaDb[];
  materias: Materia[];
  grupos: GrupoOptativas[];
  prerrequisitos: Prerrequisito[];
  estados: Map<string, EstadoEstudiante>;
  reglas: ReglaFirmaDb[];
  unidad: UnidadAvance;
}

const aMateria = (m: MateriaDb): Materia => ({ id: m.id, nombre: m.nombre, semestre: m.semestre, horas: m.horas, creditos: m.creditos, grupoOptativaId: m.grupo_optativa_id });
const aGrupo = (g: GrupoOptativasDb): GrupoOptativas => ({ id: g.id, nombre: g.nombre, cantidadExigida: g.cantidad_exigida });
const aPre = (p: PrerrequisitoDb): Prerrequisito => ({ materiaId: p.materia_id, requiereId: p.requiere_id, tipo: p.tipo });

function lanzar(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function cargarMalla(planId: string, carreraId?: string | null): Promise<Malla> {
  let plan: Plan | null;
  let carrera: string | null;
  let materiasDb: MateriaDb[];
  let grupos: GrupoOptativasDb[];
  let pre: PrerrequisitoDb[];
  let reglas: ReglaFirmaDb[];
  let estadosDb: { materia_id: string; estado: EstadoMateria; nota_final: number | null; promedio_firma?: number | null }[];

  if (MODO_DEMO) {
    await esperar();
    plan = db.planes.find((p) => p.id === planId) ?? null;
    carrera = db.carreras.find((c) => c.id === carreraId)?.nombre ?? null;
    materiasDb = db.materias.filter((m) => m.plan_id === planId);
    grupos = db.grupos.filter((g) => g.plan_id === planId);
    const ids = new Set(materiasDb.map((m) => m.id));
    pre = db.prerrequisitos.filter((p) => ids.has(p.materia_id));
    reglas = db.reglas.filter((r) => r.plan_id === planId);
    estadosDb = db.estados.filter((e) => ids.has(e.materia_id));
  } else {
    const [rPlan, rCarrera, rMat, rGr, rReg] = await Promise.all([
      supabase.from('planes').select('*').eq('id', planId).maybeSingle(),
      carreraId ? supabase.from('carreras').select('nombre').eq('id', carreraId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from('materias').select('*').eq('plan_id', planId).order('semestre').order('orden'),
      supabase.from('grupos_optativas').select('*').eq('plan_id', planId),
      supabase.from('reglas_firma').select('*').eq('plan_id', planId),
    ]);
    lanzar(rPlan.error); lanzar(rMat.error); lanzar(rGr.error); lanzar(rReg.error);
    plan = rPlan.data;
    carrera = (rCarrera.data as { nombre: string } | null)?.nombre ?? null;
    materiasDb = rMat.data ?? [];
    grupos = rGr.data ?? [];
    reglas = rReg.data ?? [];
    const ids = materiasDb.map((m) => m.id);
    if (ids.length) {
      const [rPre, rEst] = await Promise.all([
        supabase.from('prerrequisitos').select('*').in('materia_id', ids),
        supabase.from('materias_estudiante').select('materia_id, estado, nota_final, promedio_firma').in('materia_id', ids),
      ]);
      lanzar(rPre.error); lanzar(rEst.error);
      pre = rPre.data ?? [];
      estadosDb = (rEst.data ?? []) as typeof estadosDb;
    } else {
      pre = [];
      estadosDb = [];
    }
  }

  return {
    plan,
    carrera,
    materiasDb,
    materias: materiasDb.map(aMateria),
    grupos: grupos.map(aGrupo),
    prerrequisitos: pre.map(aPre),
    estados: new Map(estadosDb.map((e) => [e.materia_id, { estado: e.estado, notaFinal: e.nota_final, promedioFirma: e.promedio_firma == null ? null : Number(e.promedio_firma) }])),
    reglas,
    unidad: plan?.unidad_avance ?? 'materias',
  };
}

export async function guardarEstadoMateria(materiaId: string, estado: EstadoMateria, notaFinal: number | null) {
  const nota = estado === 'aprobada' ? notaFinal : null;
  if (MODO_DEMO) {
    await esperar(150);
    db.estados = db.estados.filter((e) => e.materia_id !== materiaId);
    if (estado !== 'pendiente') {
      db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, estado, nota_final: nota, fecha: null, periodo: null, updated_at: new Date().toISOString() });
    }
    return;
  }
  if (estado === 'pendiente') {
    const { error } = await supabase.from('materias_estudiante').delete().eq('materia_id', materiaId);
    lanzar(error);
    return;
  }
  const { error } = await supabase.from('materias_estudiante').upsert({ materia_id: materiaId, estado, nota_final: nota }, { onConflict: 'usuario_id,materia_id' });
  lanzar(error);
}

/**
 * Guarda el promedio de firma de la materia. Si estaba pendiente o cursando
 * pasa a firmada; si ya estaba aprobada queda aprobada y solo se guarda el
 * promedio.
 */
export async function guardarFirma(materiaId: string, promedio: number) {
  if (MODO_DEMO) {
    await esperar(150);
    const previo = db.estados.find((e) => e.materia_id === materiaId);
    if (previo && previo.estado === 'aprobada') {
      previo.promedio_firma = promedio;
      return;
    }
    db.estados = db.estados.filter((e) => e.materia_id !== materiaId);
    db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, estado: 'firmada', nota_final: null, fecha: null, periodo: null, updated_at: new Date().toISOString(), promedio_firma: promedio });
    return;
  }
  const { data, error } = await supabase.from('materias_estudiante').select('estado').eq('materia_id', materiaId).maybeSingle();
  lanzar(error);
  if ((data as { estado: EstadoMateria } | null)?.estado === 'aprobada') {
    const r = await supabase.from('materias_estudiante').update({ promedio_firma: promedio }).eq('materia_id', materiaId);
    lanzar(r.error);
    return;
  }
  const r = await supabase
    .from('materias_estudiante')
    .upsert({ materia_id: materiaId, estado: 'firmada', nota_final: null, nota_desde_final: false, promedio_firma: promedio }, { onConflict: 'usuario_id,materia_id' });
  lanzar(r.error);
}

export interface CambioEstado {
  materiaId: string;
  estado: EstadoMateria;
  notaFinal: number | null;
}

/**
 * Guarda muchos estados de una sola vez (marcar varias aprobadas, deshacer).
 * No exige prerrequisitos: quien carga en bloque su historial ya los cumplió.
 */
export async function guardarEstadosEnBloque(cambios: CambioEstado[]) {
  if (!cambios.length) return;
  const borrar = cambios.filter((c) => c.estado === 'pendiente').map((c) => c.materiaId);
  const guardar = cambios
    .filter((c) => c.estado !== 'pendiente')
    .map((c) => ({ materia_id: c.materiaId, estado: c.estado, nota_final: c.estado === 'aprobada' ? c.notaFinal : null, nota_desde_final: false }));
  if (MODO_DEMO) {
    await esperar(250);
    const tocadas = new Set(cambios.map((c) => c.materiaId));
    db.estados = db.estados.filter((e) => !tocadas.has(e.materia_id));
    for (const g of guardar) {
      db.estados.push({ usuario_id: UID_DEMO, ...g, fecha: null, periodo: null, updated_at: new Date().toISOString() });
    }
    return;
  }
  if (guardar.length) {
    const { error } = await supabase.from('materias_estudiante').upsert(guardar, { onConflict: 'usuario_id,materia_id' });
    lanzar(error);
  }
  if (borrar.length) {
    const { error } = await supabase.from('materias_estudiante').delete().in('materia_id', borrar);
    lanzar(error);
  }
}

/** Regla que aplica a una materia: la propia, o la general del plan. */
export function reglaDe(reglas: ReglaFirmaDb[], materiaId: string): ReglaFirma | null {
  const r = reglas.find((x) => x.materia_id === materiaId) ?? reglas.find((x) => x.materia_id == null);
  if (!r) return null;
  return {
    minimoTeoria: r.minimo_teoria,
    minimoLaboratorio: r.minimo_laboratorio,
    minimoAsistencia: r.minimo_asistencia,
    minimoAsistenciaLab: r.minimo_asistencia_lab,
    modoLaboratorio: r.modo_laboratorio,
    pesoLaboratorio: r.peso_laboratorio,
  };
}

/** Regla general de la FCQ (Art. 43), cuando la materia o el plan no tienen una propia. */
export const REGLA_POR_DEFECTO: ReglaFirma = REGLA_FCQ;

/* ------------------------------------------------------------------ */
/* Firma                                                               */
/* ------------------------------------------------------------------ */

export interface DatosFirma {
  evaluacionesDb: EvaluacionDb[];
  evaluaciones: Evaluacion[];
  asistencia: AsistenciaDb | null;
  asistenciaLab: AsistenciaDb | null;
}

export const aEvaluacion = (e: EvaluacionDb): Evaluacion => ({
  nombre: e.nombre, componente: e.componente, ponderacion: Number(e.ponderacion), porcentaje: e.porcentaje == null ? null : Number(e.porcentaje),
  puntajeObtenido: e.puntaje_obtenido == null ? null : Number(e.puntaje_obtenido), puntajeTotal: e.puntaje_total == null ? null : Number(e.puntaje_total), rendida: e.rendida,
});

export const aAsistencia = (a: AsistenciaDb | null): Asistencia | null =>
  a ? { clasesDictadas: a.clases_dictadas, clasesAsistidas: a.clases_asistidas, clasesTotales: a.clases_totales } : null;

/** Evaluaciones y asistencia de varias materias a la vez (para listas). */
export async function cargarFirmas(materiaIds: string[]): Promise<Map<string, DatosFirma>> {
  let evals: EvaluacionDb[];
  let asis: AsistenciaDb[];
  if (!materiaIds.length) return new Map();
  if (MODO_DEMO) {
    await esperar(150);
    evals = db.evaluaciones.filter((e) => materiaIds.includes(e.materia_id));
    asis = db.asistencias.filter((a) => materiaIds.includes(a.materia_id));
  } else {
    const [rE, rA] = await Promise.all([
      supabase.from('evaluaciones').select('*').in('materia_id', materiaIds).order('orden').order('created_at'),
      supabase.from('asistencias').select('*').in('materia_id', materiaIds),
    ]);
    lanzar(rE.error); lanzar(rA.error);
    evals = rE.data ?? [];
    asis = rA.data ?? [];
  }
  const mapa = new Map<string, DatosFirma>();
  for (const id of materiaIds) {
    const evaluacionesDb = evals.filter((e) => e.materia_id === id);
    mapa.set(id, {
      evaluacionesDb,
      // Pesos automáticos: todas las evaluaciones de un componente pesan igual.
      evaluaciones: pesosIguales(evaluacionesDb.map(aEvaluacion)),
      asistencia: asis.find((a) => a.materia_id === id && a.componente === 'teoria') ?? null,
      asistenciaLab: asis.find((a) => a.materia_id === id && a.componente === 'laboratorio') ?? null,
    });
  }
  return mapa;
}

export type NuevaEvaluacion = Pick<EvaluacionDb, 'nombre' | 'componente' | 'ponderacion' | 'porcentaje' | 'puntaje_obtenido' | 'puntaje_total' | 'rendida' | 'fecha'>;

export async function guardarEvaluacion(materiaId: string, datos: NuevaEvaluacion, id?: string) {
  if (MODO_DEMO) {
    await esperar(150);
    if (id) db.evaluaciones = db.evaluaciones.map((e) => (e.id === id ? { ...e, ...datos } : e));
    else db.evaluaciones.push({ ...datos, id: idDemo(), usuario_id: UID_DEMO, materia_id: materiaId, orden: db.evaluaciones.length, created_at: new Date().toISOString() });
    return;
  }
  const { error } = id
    ? await supabase.from('evaluaciones').update(datos).eq('id', id)
    : await supabase.from('evaluaciones').insert({ ...datos, materia_id: materiaId });
  lanzar(error);
}

export async function borrarEvaluacion(id: string) {
  if (MODO_DEMO) {
    await esperar(100);
    db.evaluaciones = db.evaluaciones.filter((e) => e.id !== id);
    return;
  }
  const { error } = await supabase.from('evaluaciones').delete().eq('id', id);
  lanzar(error);
}

export async function guardarAsistencia(materiaId: string, componente: ComponenteDb, a: { clases_dictadas: number; clases_asistidas: number; clases_totales: number | null }) {
  if (MODO_DEMO) {
    db.asistencias = db.asistencias.filter((x) => !(x.materia_id === materiaId && x.componente === componente));
    db.asistencias.push({ usuario_id: UID_DEMO, materia_id: materiaId, componente, ...a });
    return;
  }
  const { error } = await supabase.from('asistencias').upsert({ materia_id: materiaId, componente, ...a }, { onConflict: 'usuario_id,materia_id,componente' });
  lanzar(error);
}

/* ------------------------------------------------------------------ */
/* Tipos de evaluación                                                 */
/* ------------------------------------------------------------------ */

export type TipoEvaluacion = 'parcial' | 'tp' | 'laboratorio';

/**
 * Tipo de una evaluación para mostrar. La base guarda solo el componente
 * (teoría o laboratorio): un trabajo práctico es teoría con nombre de TP.
 */
export function tipoEvaluacion(e: { componente: ComponenteDb; nombre: string }): TipoEvaluacion {
  if (e.componente === 'laboratorio') return 'laboratorio';
  return /trabajo|pr[aá]ctic|\btps?\b/i.test(e.nombre) ? 'tp' : 'parcial';
}

/** La materia tiene laboratorio si el estudiante cargó al menos una nota de laboratorio. */
export const tieneLab = (evals: { componente: ComponenteDb }[]) => evals.some((e) => e.componente === 'laboratorio');
