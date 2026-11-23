/**
 * Lectura y escritura de lo académico (malla, estados, firma) para las
 * pantallas. Usa Supabase, o los datos de ejemplo en modo demostración.
 * El cálculo vive en src/lib/progreso.ts y src/lib/firma.ts.
 */
import { periodoAlCambiar, periodoDe } from '../lib/finales';
import { pesosIguales, type Asistencia, type Evaluacion, type ReglaFirma } from '../lib/firma';
import type { EstadoEstudiante, EstadoMateria, GrupoOptativas, Materia, Prerrequisito, UnidadAvance } from '../lib/progreso';
import type { IntentoAImportar, PlanImportacion } from '../lib/extracto-ealu';
import type { IntentoFinal, LlamadoCargado } from '../lib/finales';
import { aplicarRecuperatorio, aplicarRegularizacion, esRecuperatorio, esRegularizacion, REGLA_FCQ } from '../lib/reglamento-fcq';
import { supabase } from '../lib/supabase';
import type { AsistenciaDb, ComponenteDb, EvaluacionDb, ExamenFinalDb, GrupoOptativasDb, MateriaDb, Plan, PrerrequisitoDb, ReglaFirmaDb } from '../lib/tipos-db';
import { db, esperar, idDemo, MODO_DEMO, UID_DEMO } from './demo';
import { lanzar } from '../lib/errores';

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
  /** Intentos de final (todos los llamados), para los promedios con y sin aplazos. */
  intentos: IntentoFinal[];
}

const aMateria = (m: MateriaDb): Materia => ({ id: m.id, nombre: m.nombre, semestre: m.semestre, horas: m.horas, creditos: m.creditos, grupoOptativaId: m.grupo_optativa_id });
const aGrupo = (g: GrupoOptativasDb): GrupoOptativas => ({ id: g.id, nombre: g.nombre, cantidadExigida: g.cantidad_exigida });
const aPre = (p: PrerrequisitoDb): Prerrequisito => ({ materiaId: p.materia_id, requiereId: p.requiere_id, tipo: p.tipo });

export async function cargarMalla(planId: string, carreraId?: string | null): Promise<Malla> {
  let plan: Plan | null;
  let carrera: string | null;
  let materiasDb: MateriaDb[];
  let grupos: GrupoOptativasDb[];
  let pre: PrerrequisitoDb[];
  let reglas: ReglaFirmaDb[];
  let finalesDb: Pick<ExamenFinalDb, 'materia_id' | 'nota' | 'llamado' | 'periodo' | 'fecha' | 'tipo'>[];
  let estadosDb: { materia_id: string; estado: EstadoMateria; nota_final: number | null; promedio_firma?: number | null; respaldo_recursada?: unknown }[];

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
    finalesDb = db.finales.filter((f) => ids.has(f.materia_id));
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
      const [rPre, rEst, rFin] = await Promise.all([
        supabase.from('prerrequisitos').select('*').in('materia_id', ids),
        supabase.from('materias_estudiante').select('materia_id, estado, nota_final, promedio_firma, respaldo_recursada').in('materia_id', ids),
        supabase.from('examenes_finales').select('materia_id, nota, llamado, periodo, fecha, tipo').in('materia_id', ids),
      ]);
      lanzar(rPre.error); lanzar(rEst.error); lanzar(rFin.error);
      pre = rPre.data ?? [];
      estadosDb = (rEst.data ?? []) as typeof estadosDb;
      finalesDb = (rFin.data ?? []) as typeof finalesDb;
    } else {
      pre = [];
      estadosDb = [];
      finalesDb = [];
    }
  }

  return {
    plan,
    carrera,
    materiasDb,
    materias: materiasDb.map(aMateria),
    grupos: grupos.map(aGrupo),
    prerrequisitos: pre.map(aPre),
    estados: new Map(estadosDb.map((e) => [e.materia_id, {
      estado: e.estado,
      notaFinal: e.nota_final,
      promedioFirma: e.promedio_firma == null ? null : Number(e.promedio_firma),
      puedeDeshacerRecursada: e.estado === 'cursando' && e.respaldo_recursada != null,
    }])),
    reglas,
    unidad: plan?.unidad_avance ?? 'materias',
    // Los llamados usados para regularizar no tienen nota: no son intentos de final.
    intentos: finalesDb
      .filter((f) => (f.tipo ?? 'final') === 'final' && f.nota != null)
      .map((f) => ({ materiaId: f.materia_id, nota: Number(f.nota), llamado: f.llamado, periodo: f.periodo, fecha: f.fecha })),
  };
}

export async function guardarEstadoMateria(materiaId: string, estado: EstadoMateria, notaFinal: number | null) {
  const nota = estado === 'aprobada' ? notaFinal : null;
  if (MODO_DEMO) {
    await esperar(150);
    const previo = db.estados.find((e) => e.materia_id === materiaId);
    db.estados = db.estados.filter((e) => e.materia_id !== materiaId);
    if (estado !== 'pendiente') {
      const periodo = periodoAlCambiar(previo?.estado ?? null, previo?.periodo ?? null, estado);
      db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, estado, nota_final: nota, fecha: null, periodo, updated_at: new Date().toISOString() });
    }
    return;
  }
  if (estado === 'pendiente') {
    const { error } = await supabase.from('materias_estudiante').delete().eq('materia_id', materiaId);
    lanzar(error);
    return;
  }
  const previo = await supabase.from('materias_estudiante').select('estado, periodo').eq('materia_id', materiaId).maybeSingle();
  lanzar(previo.error);
  const antes = previo.data as { estado: EstadoMateria; periodo: string | null } | null;
  const periodo = periodoAlCambiar(antes?.estado ?? null, antes?.periodo ?? null, estado);
  const { error } = await supabase.from('materias_estudiante').upsert({ materia_id: materiaId, estado, nota_final: nota, nota_desde_final: false, respaldo_recursada: null, periodo }, { onConflict: 'usuario_id,materia_id' });
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
    const periodo = previo?.estado === 'firmada' && previo.periodo ? previo.periodo : periodoDe();
    db.estados = db.estados.filter((e) => e.materia_id !== materiaId);
    db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, estado: 'firmada', nota_final: null, fecha: null, periodo, updated_at: new Date().toISOString(), promedio_firma: promedio });
    return;
  }
  const { data, error } = await supabase.from('materias_estudiante').select('estado, periodo').eq('materia_id', materiaId).maybeSingle();
  lanzar(error);
  if ((data as { estado: EstadoMateria } | null)?.estado === 'aprobada') {
    const r = await supabase.from('materias_estudiante').update({ promedio_firma: promedio, respaldo_recursada: null }).eq('materia_id', materiaId);
    lanzar(r.error);
    return;
  }
  const r = await supabase
    .from('materias_estudiante')
    .upsert({
      materia_id: materiaId, estado: 'firmada', nota_final: null, nota_desde_final: false, promedio_firma: promedio, respaldo_recursada: null,
      // Firmada desde la calculadora: queda como de este semestre (salvo que ya estuviera firmada).
      // Si ya estaba firmada pero sin semestre (de antes de guardarlo), toma este.
      periodo: (data as { estado: EstadoMateria; periodo: string | null } | null)?.estado === 'firmada' ? (data as { periodo: string | null }).periodo ?? periodoDe() : periodoDe(),
    }, { onConflict: 'usuario_id,materia_id' });
  lanzar(r.error);
}

/** Intentos de final ya cargados y materias aprobadas, para no duplicar al importar. */
export async function cargarParaImportar(): Promise<{ existentes: IntentoAImportar[]; aprobadas: Set<string> }> {
  if (MODO_DEMO) {
    await esperar(100);
    return { existentes: [], aprobadas: new Set(db.estados.filter((e) => e.estado === 'aprobada').map((e) => e.materia_id)) };
  }
  const [intentos, estados] = await Promise.all([
    supabase.from('examenes_finales').select('materia_id, fecha, nota'),
    supabase.from('materias_estudiante').select('materia_id').eq('estado', 'aprobada'),
  ]);
  lanzar(intentos.error);
  lanzar(estados.error);
  return {
    existentes: (intentos.data ?? []) as IntentoAImportar[],
    aprobadas: new Set((estados.data ?? []).map((e: { materia_id: string }) => e.materia_id)),
  };
}

/**
 * Carga lo que salió del extracto del EALU. Los finales van a
 * examenes_finales (la base aprueba la materia con esa nota); las aprobadas
 * sin nota se marcan aprobadas sin tocar las que ya lo estaban.
 */
export async function importarExtracto(plan: PlanImportacion) {
  if (MODO_DEMO) {
    await esperar(200);
    const hoy = new Date().toISOString();
    const aprobar = (materia_id: string, nota: number | null, fecha: string | null) => {
      const periodo = db.estados.find((e) => e.materia_id === materia_id)?.periodo ?? null;
      db.estados = db.estados.filter((e) => e.materia_id !== materia_id);
      db.estados.push({ usuario_id: UID_DEMO, materia_id, estado: 'aprobada', nota_final: nota, fecha, periodo, updated_at: hoy });
    };
    // Como el trigger de la base: aprueba con la mejor nota aprobada (≥ 2).
    const mejor = new Map<string, IntentoAImportar>();
    for (const i of plan.intentos) {
      if (i.nota < 2) continue;
      const m = mejor.get(i.materia_id);
      if (!m || i.nota > m.nota) mejor.set(i.materia_id, i);
    }
    mejor.forEach((i) => aprobar(i.materia_id, i.nota, i.fecha));
    plan.aprobadasSinNota.forEach((m) => aprobar(m, null, null));
    return;
  }
  if (plan.intentos.length) {
    const { error } = await supabase.from('examenes_finales').insert(plan.intentos);
    lanzar(error);
  }
  if (plan.aprobadasSinNota.length) {
    const { error } = await supabase
      .from('materias_estudiante')
      .upsert(
        plan.aprobadasSinNota.map((materia_id) => ({ materia_id, estado: 'aprobada' as const, nota_final: null, nota_desde_final: false })),
        { onConflict: 'usuario_id,materia_id' },
      );
    lanzar(error);
  }
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
export async function guardarEstadosEnBloque(cambios: CambioEstado[], opciones: { soloNuevas?: boolean } = {}) {
  if (!cambios.length) return;
  const borrar = cambios.filter((c) => c.estado === 'pendiente').map((c) => c.materiaId);
  const guardar = cambios
    .filter((c) => c.estado !== 'pendiente')
    .map((c) => ({ materia_id: c.materiaId, estado: c.estado, nota_final: c.estado === 'aprobada' ? c.notaFinal : null, nota_desde_final: false, respaldo_recursada: null }));
  if (MODO_DEMO) {
    await esperar(250);
    const tocadas = new Set(cambios.map((c) => c.materiaId));
    const existentes = new Set(db.estados.map((e) => e.materia_id));
    const previos = new Map(db.estados.map((e) => [e.materia_id, e.periodo]));
    if (!opciones.soloNuevas) db.estados = db.estados.filter((e) => !tocadas.has(e.materia_id));
    for (const g of guardar) {
      if (opciones.soloNuevas && existentes.has(g.materia_id)) continue;
      // Igual que el upsert de la base: el periodo que ya tenía se conserva.
      db.estados.push({ usuario_id: UID_DEMO, ...g, fecha: null, periodo: previos.get(g.materia_id) ?? null, updated_at: new Date().toISOString() });
    }
    return;
  }
  if (guardar.length) {
    const { error } = await supabase.from('materias_estudiante').upsert(guardar, { onConflict: 'usuario_id,materia_id', ignoreDuplicates: !!opciones.soloNuevas });
    lanzar(error);
  }
  if (borrar.length) {
    const { error } = await supabase.from('materias_estudiante').delete().in('materia_id', borrar);
    lanzar(error);
  }
}

/** Intentos de final de una materia (todos los periodos). */
export async function cargarFinales(materiaId: string): Promise<ExamenFinalDb[]> {
  if (MODO_DEMO) {
    await esperar(100);
    return db.finales.filter((f) => f.materia_id === materiaId);
  }
  const { data, error } = await supabase.from('examenes_finales').select('*').eq('materia_id', materiaId).order('periodo').order('llamado');
  lanzar(error);
  return (data ?? []) as ExamenFinalDb[];
}

/**
 * Guarda los tres llamados de un periodo de la cursada actual: borra los de
 * ese periodo y carga los que tienen nota o se usaron para regularizar. La
 * base aprueba la materia con la mejor nota de final (≥ 2) o la vuelve a
 * firmada si ya no hay ninguna aprobada. Los intentos de una cursada
 * anterior no se tocan.
 */
export async function guardarFinales(materiaId: string, periodo: string, llamados: LlamadoCargado[]) {
  if (llamados.filter((l) => l.tipo === 'recuperatorio' || l.tipo === 'regularizacion').length > 1) {
    throw new Error('Recu o Regu: se usa uno solo por cursada.');
  }
  const filas = llamados.map((l) => ({
    materia_id: materiaId,
    periodo,
    llamado: l.llamado,
    tipo: l.tipo ?? ('final' as const),
    nota: l.tipo && l.tipo !== 'final' ? null : l.nota,
    porcentaje: l.tipo && l.tipo !== 'final' ? null : l.porcentaje,
  }));
  if (MODO_DEMO) {
    await esperar(200);
    // Igual que el índice de la base: Recu o Regu, uno solo por cursada.
    const otro = db.finales.some((f) => f.materia_id === materiaId && f.periodo !== periodo && !f.cursada_anterior && (f.tipo === 'recuperatorio' || f.tipo === 'regularizacion'));
    if (otro && filas.some((f) => f.tipo !== 'final')) throw new Error('Ya usaste el Recu o la Regu en otro semestre de esta cursada. Se usa uno solo.');
    db.finales = db.finales.filter((f) => !(f.materia_id === materiaId && f.periodo === periodo && !f.cursada_anterior));
    const hoy = new Date().toISOString();
    for (const f of filas) db.finales.push({ id: idDemo(), usuario_id: UID_DEMO, fecha: null, created_at: hoy, cursada_anterior: false, ...f });
    // Igual que el trigger de la base.
    const notas = db.finales.filter((f) => f.materia_id === materiaId && (f.tipo ?? 'final') === 'final' && !f.cursada_anterior && f.nota != null).map((f) => f.nota as number);
    const mejor = Math.max(0, ...notas);
    const e = db.estados.find((x) => x.materia_id === materiaId);
    if (mejor >= 2) {
      if (e) Object.assign(e, { estado: 'aprobada', nota_final: mejor, nota_desde_final: true });
      else db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, estado: 'aprobada', nota_final: mejor, fecha: null, periodo: null, updated_at: hoy, nota_desde_final: true });
    } else if (e?.nota_desde_final) {
      Object.assign(e, { estado: 'firmada', nota_final: null, nota_desde_final: false });
    }
    return;
  }
  // Antes de borrar: si el Recu o la Regu ya se usó en otro semestre, el
  // insert fallaría y se perderían los finales de este semestre.
  if (filas.some((f) => f.tipo !== 'final')) {
    const otro = await supabase.from('examenes_finales').select('id').eq('materia_id', materiaId).eq('cursada_anterior', false)
      .neq('periodo', periodo).in('tipo', ['recuperatorio', 'regularizacion']).limit(1);
    lanzar(otro.error);
    if (otro.data?.length) throw new Error('Ya usaste el Recu o la Regu en otro semestre de esta cursada. Se usa uno solo.');
  }
  const borrar = await supabase.from('examenes_finales').delete().eq('materia_id', materiaId).eq('periodo', periodo).eq('cursada_anterior', false);
  lanzar(borrar.error);
  if (filas.length) {
    const { error } = await supabase.from('examenes_finales').insert(filas);
    if (error?.code === '23505' && error.message.includes('recu_o_regu')) throw new Error('Ya usaste el Recu o la Regu en otro semestre de esta cursada. Se usa uno solo.');
    lanzar(error);
  }
}

/**
 * Volver a cursar una materia (Art. 45), en un solo paso en la base: se
 * guarda un respaldo, se borran los parciales y la asistencia de teoría
 * (el laboratorio se conserva), la firma guardada se borra y los finales
 * quedan como de una cursada anterior. La materia vuelve a "cursando".
 * Se puede deshacer con deshacerRecursada.
 */
export async function recursarMateria(materiaId: string) {
  if (MODO_DEMO) {
    await esperar(200);
    const e = db.estados.find((x) => x.materia_id === materiaId);
    if (e?.estado === 'cursando' && e.respaldo_recursada) throw new Error('Ya marcaste que volvés a cursar esta materia');
    const respaldo = {
      estado: e?.estado ?? 'pendiente',
      nota_final: e?.nota_final ?? null,
      nota_desde_final: e?.nota_desde_final ?? false,
      promedio_firma: e?.promedio_firma ?? null,
      evaluaciones: db.evaluaciones.filter((x) => x.materia_id === materiaId && x.componente === 'teoria'),
      asistencia: db.asistencias.find((a) => a.materia_id === materiaId && a.componente === 'teoria') ?? null,
      finales: db.finales.filter((f) => f.materia_id === materiaId && !f.cursada_anterior).map((f) => f.id),
    };
    db.evaluaciones = db.evaluaciones.filter((x) => !(x.materia_id === materiaId && x.componente === 'teoria'));
    db.asistencias = db.asistencias.filter((a) => !(a.materia_id === materiaId && a.componente === 'teoria'));
    for (const f of db.finales) if (f.materia_id === materiaId) f.cursada_anterior = true;
    const cambios = { estado: 'cursando' as const, nota_final: null, promedio_firma: null, nota_desde_final: false, respaldo_recursada: respaldo };
    if (e) Object.assign(e, cambios);
    else db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, fecha: null, periodo: null, updated_at: new Date().toISOString(), ...cambios });
    return;
  }
  const { error } = await supabase.rpc('recursar_materia', { p_materia: materiaId });
  lanzar(error);
}

/** Deshace "volver a cursar": la materia, la firma, los parciales y los finales vuelven como estaban. */
export async function deshacerRecursada(materiaId: string) {
  if (MODO_DEMO) {
    await esperar(200);
    const e = db.estados.find((x) => x.materia_id === materiaId);
    const r = e?.respaldo_recursada as RespaldoDemo | null | undefined;
    if (!e || !r) throw new Error('No hay nada para deshacer en esta materia');
    if (
      db.evaluaciones.some((x) => x.materia_id === materiaId && x.componente === 'teoria') ||
      db.asistencias.some((x) => x.materia_id === materiaId && x.componente === 'teoria') ||
      db.finales.some((f) => f.materia_id === materiaId && !f.cursada_anterior)
    ) throw new Error('Ya cargaste parciales, asistencia o finales de la nueva cursada: no se puede deshacer');
    db.evaluaciones = db.evaluaciones.filter((x) => !(x.materia_id === materiaId && x.componente === 'teoria')).concat(r.evaluaciones);
    db.asistencias = db.asistencias.filter((a) => !(a.materia_id === materiaId && a.componente === 'teoria')).concat(r.asistencia ? [r.asistencia] : []);
    for (const f of db.finales) if (r.finales.includes(f.id)) f.cursada_anterior = false;
    Object.assign(e, { estado: r.estado, nota_final: r.nota_final, nota_desde_final: r.nota_desde_final, promedio_firma: r.promedio_firma, respaldo_recursada: null });
    return;
  }
  const { error } = await supabase.rpc('deshacer_recursada', { p_materia: materiaId });
  lanzar(error);
}

type RespaldoDemo = {
  estado: EstadoMateria; nota_final: number | null; nota_desde_final: boolean; promedio_firma: number | null;
  evaluaciones: EvaluacionDb[]; asistencia: AsistenciaDb | null; finales: string[];
};

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
  /** Se aplicó el examen de recuperación (Art. 46): alcanza con PG ≥ 50 %. */
  recuperado: boolean;
  /** Regularización (Art. 40–41): si ocupó el parcial faltado, o por qué no. */
  regularizacion: { regularizado: boolean; motivo: 'dos-faltas' | 'sin-falta' | 'sin-nota' | null };
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
    // Regularización (ocupa el parcial faltado), recuperatorio (reemplaza el
    // parcial más bajo) y pesos automáticos.
    const reg = aplicarRegularizacion(evaluacionesDb.map(aEvaluacion));
    const rec = aplicarRecuperatorio(reg.evaluaciones);
    mapa.set(id, {
      evaluacionesDb,
      evaluaciones: pesosIguales(rec.evaluaciones),
      recuperado: rec.recuperado,
      regularizacion: { regularizado: reg.regularizado, motivo: reg.motivo },
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

export type TipoEvaluacion = 'parcial' | 'tp' | 'laboratorio' | 'recuperatorio' | 'regularizacion';

/**
 * Tipo de una evaluación para mostrar. La base guarda solo el componente
 * (teoría o laboratorio): un trabajo práctico es teoría con nombre de TP.
 */
export function tipoEvaluacion(e: { componente: ComponenteDb; nombre: string }): TipoEvaluacion {
  if (e.componente === 'laboratorio') return 'laboratorio';
  if (esRecuperatorio(e)) return 'recuperatorio';
  if (esRegularizacion(e)) return 'regularizacion';
  return /trabajo|pr[aá]ctic|\btps?\b/i.test(e.nombre) ? 'tp' : 'parcial';
}

/** La materia tiene laboratorio si el estudiante cargó al menos una nota de laboratorio. */
export const tieneLab = (evals: { componente: ComponenteDb }[]) => evals.some((e) => e.componente === 'laboratorio');
