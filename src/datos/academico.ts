/**
 * Lectura y escritura de lo académico (malla, estados, firma) para las
 * pantallas. Usa Supabase, o los datos de ejemplo en modo demostración.
 * El cálculo vive en src/lib/progreso.ts y src/lib/firma.ts.
 */
import { finalesSinUbicar, llamadosUsados, periodoAlCambiar, periodoDe, recuReguDespuesDeFinal } from '../lib/finales';
import { conParcialesMinimos, idPredefinido } from '../lib/firma-carga';
import { pesosIguales, type Asistencia, type Evaluacion, type ReglaFirma } from '../lib/firma';
import type { EstadoEstudiante, EstadoMateria, GrupoOptativas, Materia, Prerrequisito, UnidadAvance } from '../lib/progreso';
import type { IntentoAImportar, PlanImportacion } from '../lib/extracto-ealu';
import type { IntentoFinal } from '../lib/finales';
import { aplicarRecuperatorio, aplicarRegularizacion, esRecuperatorio, esRegularizacion, REGLA_FCQ } from '../lib/reglamento-fcq';
import { supabase } from '../lib/supabase';
import type { AsistenciaDb, ComponenteDb, EvaluacionDb, ExamenFinalDb, GrupoOptativasDb, MateriaDb, Plan, PrerrequisitoDb, ReglaFirmaDb } from '../lib/tipos-db';
import { db, esperar, idDemo, MODO_DEMO, UID_DEMO } from './demo';
import { lanzar, textoError } from '../lib/errores';

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
  /** Una materia por cada final rendido que espera la nota (cursada actual). */
  finalesPendientes: string[];
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
  let finalesDb: Pick<ExamenFinalDb, 'materia_id' | 'nota' | 'llamado' | 'periodo' | 'fecha' | 'tipo' | 'cursada_anterior'>[];
  let estadosDb: { materia_id: string; estado: EstadoMateria; nota_final: number | null; promedio_firma?: number | null; respaldo_recursada?: unknown; periodo?: string | null; semestre_opuesto?: boolean }[];

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
        supabase.from('materias_estudiante').select('materia_id, estado, nota_final, promedio_firma, respaldo_recursada, periodo, semestre_opuesto').in('materia_id', ids),
        supabase.from('examenes_finales').select('materia_id, nota, llamado, periodo, fecha, tipo, cursada_anterior').in('materia_id', ids),
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
      periodo: e.periodo ?? null,
      semestreOpuesto: e.semestre_opuesto ?? false,
    }])),
    reglas,
    unidad: plan?.unidad_avance ?? 'materias',
    // Los llamados usados para regularizar no tienen nota: no son intentos de final.
    intentos: finalesDb
      .filter((f) => (f.tipo ?? 'final') === 'final' && f.nota != null)
      .map((f) => ({ materiaId: f.materia_id, nota: Number(f.nota), llamado: f.llamado, periodo: f.periodo, fecha: f.fecha })),
    // Rendidos que esperan la nota (una materia por cada uno): cuentan como
    // rendidos, no como calificados.
    finalesPendientes: finalesDb.filter((f) => f.tipo === 'pendiente' && !f.cursada_anterior).map((f) => f.materia_id),
  };
}

export async function guardarEstadoMateria(materiaId: string, estado: EstadoMateria, notaFinal: number | null) {
  const nota = estado === 'aprobada' ? notaFinal : null;
  // Si deja de estar aprobada (por ejemplo, cargó un final por error y la
  // vuelve a marcar como firmada), se borran los finales aprobados de esta
  // cursada: si no, la nota seguiría contando en el promedio y la base la
  // volvería a aprobar. Los aplazos se conservan.
  const borrarAprobados = estado !== 'aprobada';
  if (MODO_DEMO) {
    await esperar(150);
    if (borrarAprobados) {
      db.finales = db.finales.filter((f) => !(f.materia_id === materiaId && !f.cursada_anterior && (f.tipo ?? 'final') === 'final' && f.nota != null && f.nota >= 2));
    }
    const previo = db.estados.find((e) => e.materia_id === materiaId);
    db.estados = db.estados.filter((e) => e.materia_id !== materiaId);
    if (estado !== 'pendiente') {
      const periodo = periodoAlCambiar(previo?.estado ?? null, previo?.periodo ?? null, estado);
      db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, estado, nota_final: nota, fecha: null, periodo, updated_at: new Date().toISOString(), semestre_opuesto: previo?.semestre_opuesto ?? false });
    }
    return;
  }
  if (borrarAprobados) {
    const r = await supabase.from('examenes_finales').delete().eq('materia_id', materiaId).eq('cursada_anterior', false).eq('tipo', 'final').gte('nota', 2);
    lanzar(r.error);
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
    db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, estado: 'firmada', nota_final: null, fecha: null, periodo, updated_at: new Date().toISOString(), promedio_firma: promedio, semestre_opuesto: previo?.semestre_opuesto ?? false });
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
    return {
      // Igual que la base: los finales ya cargados (para no duplicarlos al reimportar).
      existentes: db.finales.filter((f) => (f.nota_extracto ?? f.nota) != null).map((f) => ({ materia_id: f.materia_id, fecha: f.fecha, nota: (f.nota_extracto ?? f.nota)! })),
      aprobadas: new Set(db.estados.filter((e) => e.estado === 'aprobada').map((e) => e.materia_id)),
    };
  }
  const [intentos, estados] = await Promise.all([
    supabase.from('examenes_finales').select('materia_id, fecha, nota, nota_extracto'),
    supabase.from('materias_estudiante').select('materia_id').eq('estado', 'aprobada'),
  ]);
  lanzar(intentos.error);
  lanzar(estados.error);
  return {
    // Un importado corregido se reconoce por la nota original del extracto.
    existentes: ((intentos.data ?? []) as { materia_id: string; fecha: string | null; nota: number | null; nota_extracto: number | null }[])
      .filter((f) => (f.nota_extracto ?? f.nota) != null)
      .map((f) => ({ materia_id: f.materia_id, fecha: f.fecha, nota: (f.nota_extracto ?? f.nota) as number })),
    aprobadas: new Set((estados.data ?? []).map((e: { materia_id: string }) => e.materia_id)),
  };
}

/**
 * Error de una importación que quedó a medias: los finales se guardaron
 * pero las aprobadas sin nota no. Reintentar completa lo que falta (se
 * vuelve a leer lo guardado, así que no se duplica nada).
 */
export class ImportacionParcial extends Error {
  constructor(public finalesGuardados: number, public aprobadasFaltantes: number, causa: string) {
    super(`Se guardaron ${finalesGuardados} finales, pero no las ${aprobadasFaltantes} materias aprobadas sin nota (${causa}). Tocá Importar de nuevo para completarlas: lo que ya está no se duplica.`);
    this.name = 'ImportacionParcial';
  }
}

/**
 * Carga lo que salió del extracto del EALU. Los finales van a
 * examenes_finales (la base aprueba la materia con esa nota); las aprobadas
 * sin nota se marcan aprobadas sin tocar las que ya lo estaban. Si falla lo
 * primero, no se guardó nada; si falla lo segundo, lanza ImportacionParcial
 * diciendo exactamente qué quedó guardado.
 */
export async function importarExtracto(plan: PlanImportacion) {
  if (MODO_DEMO) {
    await esperar(200);
    const hoy = new Date().toISOString();
    // Los intentos quedan guardados como en la base (para reimportar igual que en producción).
    for (const i of plan.intentos) {
      db.finales.push({ id: idDemo(), usuario_id: UID_DEMO, materia_id: i.materia_id, periodo: null, llamado: null, fecha: i.fecha, nota: i.nota, created_at: hoy, version: 1, origen: 'extracto', nota_extracto: i.nota });
    }
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
    // Conservan el origen y la nota del extracto: si después se corrige la
    // nota, reimportar no los vuelve a cargar.
    const { error } = await supabase.from('examenes_finales').insert(plan.intentos.map((i) => ({ ...i, origen: 'extracto' as const, nota_extracto: i.nota })));
    lanzar(error);
  }
  if (plan.aprobadasSinNota.length) {
    const { error } = await supabase
      .from('materias_estudiante')
      .upsert(
        plan.aprobadasSinNota.map((materia_id) => ({ materia_id, estado: 'aprobada' as const, nota_final: null, nota_desde_final: false })),
        { onConflict: 'usuario_id,materia_id' },
      );
    if (error && plan.intentos.length) throw new ImportacionParcial(plan.intentos.length, plan.aprobadasSinNota.length, textoError(error));
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

export const ERROR_REGU_TRAS_FINAL = 'Ya rendiste un final: después no se puede rendir Recu ni Regu. Si te equivocaste, corregí ese resultado.';
const ERROR_UN_RECU_O_REGU = 'Ya usaste el Recu o la Regu en otro semestre de esta cursada. Se usa uno solo.';
export const ERROR_DESACTUALIZADO = 'Ese resultado cambió en otro dispositivo. Volvé a abrir la materia para ver lo último.';
const ERROR_TOPE = 'Ya registraste los 3 finales de esta materia en esta cursada (Art. 62).';

/** Identificador nuevo (UUID v4). Se genera una vez por formulario: un reintento guarda la misma fila. */
export function nuevoId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Errores de las funciones de finales de la base, en castellano. */
function errorDeFinales(error: { code?: string; message: string } | null | undefined) {
  if (!error) return;
  if (error.code === '23505' && error.message.includes('recu_o_regu')) throw new Error(ERROR_UN_RECU_O_REGU);
  if (/guardar_final|borrar_final|guardar_parcial|borrar_parcial/.test(error.message) && /function|función|schema cache/i.test(error.message)) {
    throw new Error('Falta actualizar la base del CEQ para guardar finales. Avisale al CEQ y probá más tarde.');
  }
  lanzar(error);
}

/** En modo demo, lo que hace el trigger de la base: aprueba con la mejor nota o vuelve a firmada. */
function recalcularDemo(materiaId: string) {
  const hoy = new Date().toISOString();
  const notas = db.finales.filter((f) => f.materia_id === materiaId && (f.tipo ?? 'final') === 'final' && !f.cursada_anterior && f.nota != null).map((f) => f.nota as number);
  const mejor = Math.max(0, ...notas);
  const e = db.estados.find((x) => x.materia_id === materiaId);
  if (mejor >= 2) {
    if (e) Object.assign(e, { estado: 'aprobada', nota_final: mejor, nota_desde_final: true });
    else db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, estado: 'aprobada', nota_final: mejor, fecha: null, periodo: null, updated_at: hoy, nota_desde_final: true });
  } else if (e?.nota_desde_final) {
    Object.assign(e, { estado: 'firmada', nota_final: null, nota_desde_final: false });
  }
}

/** En modo demo, los controles que hace la base (tope de 3 y orden Recu/Regu). */
function validarDemo(materiaId: string) {
  const actuales = db.finales.filter((f) => f.materia_id === materiaId && !f.cursada_anterior);
  if (llamadosUsados(actuales) > 3) throw new Error(ERROR_TOPE);
  if (actuales.filter((f) => f.tipo === 'recuperatorio' || f.tipo === 'regularizacion').length > 1) throw new Error(ERROR_UN_RECU_O_REGU);
  if (recuReguDespuesDeFinal(actuales.filter((f) => f.periodo != null && f.llamado != null))) throw new Error(ERROR_REGU_TRAS_FINAL);
}

/** Corre `cambio` sobre los finales de la demo y lo deshace si no pasa los controles. */
async function transaccionDemo(materiaId: string, cambio: () => void) {
  await esperar(150);
  const antes = db.finales.map((f) => ({ ...f }));
  const evalsAntes = db.evaluaciones.map((e) => ({ ...e }));
  try {
    cambio();
    validarDemo(materiaId);
  } catch (e) {
    db.finales = antes;
    db.evaluaciones = evalsAntes;
    throw e;
  }
  recalcularDemo(materiaId);
}

export interface DatosResultado {
  periodo: string;
  llamado: 1 | 2 | 3;
  tipo: 'final' | 'pendiente' | 'ausente';
  nota: number | null;
  porcentaje: number | null;
  fecha: string | null;
  semestre_opuesto: boolean;
}

/**
 * Crea o corrige UN resultado de final, por su ID y con su versión: si otro
 * dispositivo lo cambió, no se pisa (ERROR_DESACTUALIZADO). Si el llamado
 * elegido lo ocupa otro resultado (que la app mostró), se reemplaza en la
 * misma transacción. Corregir un final importado lo ubica, no lo duplica;
 * conserva su origen y la nota del extracto. Con `{ cursadaAnterior: true }`
 * un importado pasa a una cursada anterior (no gasta un final de esta).
 */
export async function guardarResultadoFinal(
  materiaId: string,
  fila: ExamenFinalDb | null,
  datos: DatosResultado | { cursadaAnterior: true },
  reemplaza?: ExamenFinalDb | null,
) {
  const anterior = 'cursadaAnterior' in datos;
  if (MODO_DEMO) {
    await transaccionDemo(materiaId, () => {
      const actual = fila ? db.finales.find((f) => f.id === fila.id) : null;
      if (fila && !actual) throw new Error(ERROR_DESACTUALIZADO);
      if (actual && (actual.version ?? 1) !== (fila!.version ?? 1)) throw new Error(ERROR_DESACTUALIZADO);
      if (anterior) {
        if (!actual || actual.origen !== 'extracto') throw new Error('Solo un final importado del extracto se puede pasar a una cursada anterior.');
        Object.assign(actual, { cursada_anterior: true, version: (actual.version ?? 1) + 1 });
        return;
      }
      const ocupante = db.finales.find((f) => f.materia_id === materiaId && !f.cursada_anterior && f.periodo === datos.periodo && f.llamado === datos.llamado && f.id !== fila?.id);
      if (ocupante) {
        if (ocupante.tipo === 'recuperatorio' || ocupante.tipo === 'regularizacion') throw new Error('Ese llamado lo usaste para el Recu o la Regu. Elegí otro, o cambialo desde Parciales.');
        if (ocupante.id !== reemplaza?.id || (ocupante.version ?? 1) !== (reemplaza.version ?? 1)) throw new Error(ERROR_DESACTUALIZADO);
        db.finales = db.finales.filter((f) => f.id !== ocupante.id);
      }
      if (actual) Object.assign(actual, datos, { version: (actual.version ?? 1) + 1 });
      else db.finales.push({ id: idDemo(), usuario_id: UID_DEMO, materia_id: materiaId, created_at: new Date().toISOString(), cursada_anterior: false, version: 1, origen: 'manual', ...datos });
    });
    return;
  }
  const { error } = await supabase.rpc('guardar_final', {
    p_materia: materiaId,
    p_id: fila?.id ?? null,
    p_version: fila ? fila.version ?? 1 : null,
    p_fila: anterior ? { cursada_anterior: true } : { ...datos },
    p_reemplaza: reemplaza?.id ?? null,
    p_reemplaza_version: reemplaza ? reemplaza.version ?? 1 : null,
  });
  errorDeFinales(error);
}

/** Borra un resultado de final por su ID (si nadie lo cambió desde que se mostró). */
export async function borrarResultadoFinal(materiaId: string, fila: ExamenFinalDb) {
  if (MODO_DEMO) {
    await transaccionDemo(materiaId, () => {
      const actual = db.finales.find((f) => f.id === fila.id);
      if (!actual) return;
      if ((actual.version ?? 1) !== (fila.version ?? 1)) throw new Error(ERROR_DESACTUALIZADO);
      db.finales = db.finales.filter((f) => f.id !== fila.id);
    });
    return;
  }
  const { error } = await supabase.rpc('borrar_final', { p_id: fila.id, p_version: fila.version ?? 1 });
  errorDeFinales(error);
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
    if (e?.estado === 'aprobada') throw new Error('Ya aprobaste esta materia');
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
    const cambios = { estado: 'cursando' as const, nota_final: null, promedio_firma: null, nota_desde_final: false, respaldo_recursada: { ...respaldo, semestre_opuesto: e?.semestre_opuesto ?? false }, semestre_opuesto: false };
    if (e) Object.assign(e, cambios);
    else db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, fecha: null, periodo: null, updated_at: new Date().toISOString(), ...cambios });
    return;
  }
  const { error } = await supabase.rpc('recursar_materia', { p_materia: materiaId });
  lanzar(error);
}

/**
 * Volver a cursar en el semestre opuesto (Art. 7 c y 23): solo se borran
 * los parciales teóricos; el laboratorio, la asistencia y los finales de la
 * cursada se conservan (los tres llamados se comparten). Sin recuperatorio.
 * Se puede deshacer con deshacerRecursada.
 */
export async function cursarSemestreOpuesto(materiaId: string) {
  if (MODO_DEMO) {
    await esperar(200);
    const e = db.estados.find((x) => x.materia_id === materiaId);
    if (e?.estado === 'aprobada') throw new Error('Ya aprobaste esta materia');
    if (e?.estado === 'cursando' && e.respaldo_recursada) throw new Error('Ya marcaste que volvés a cursar esta materia');
    // Igual que la base: el Recu y la Regu no gastan un final.
    const actuales = db.finales.filter((f) => f.materia_id === materiaId && !f.cursada_anterior);
    if (finalesSinUbicar(actuales).length) throw new Error('Tenés finales importados del extracto sin ubicar en esta materia. Indicá el semestre y el llamado de cada uno para saber cuántos te quedan.');
    if (llamadosUsados(actuales) >= 3) throw new Error('Ya rendiste los tres finales: tenés que volver a cursar en el semestre normal (Art. 62)');
    const respaldo = {
      modo: 'opuesto',
      estado: e?.estado ?? 'pendiente',
      nota_final: e?.nota_final ?? null,
      nota_desde_final: e?.nota_desde_final ?? false,
      promedio_firma: e?.promedio_firma ?? null,
      semestre_opuesto: e?.semestre_opuesto ?? false,
      evaluaciones: db.evaluaciones.filter((x) => x.materia_id === materiaId && x.componente === 'teoria'),
      asistencia: null,
      finales: db.finales.filter((f) => f.materia_id === materiaId && !f.cursada_anterior).map((f) => f.id),
    };
    db.evaluaciones = db.evaluaciones.filter((x) => !(x.materia_id === materiaId && x.componente === 'teoria'));
    const cambios = { estado: 'cursando' as const, nota_final: null, promedio_firma: null, nota_desde_final: false, respaldo_recursada: respaldo, semestre_opuesto: true };
    if (e) Object.assign(e, cambios);
    else db.estados.push({ usuario_id: UID_DEMO, materia_id: materiaId, fecha: null, periodo: null, updated_at: new Date().toISOString(), ...cambios });
    return;
  }
  const { error } = await supabase.rpc('cursar_semestre_opuesto', { p_materia: materiaId });
  lanzar(error);
}

/** Deshace "volver a cursar": la materia, la firma, los parciales y los finales vuelven como estaban. */
export async function deshacerRecursada(materiaId: string) {
  if (MODO_DEMO) {
    await esperar(200);
    const e = db.estados.find((x) => x.materia_id === materiaId);
    const r = e?.respaldo_recursada as RespaldoDemo | null | undefined;
    if (!e || !r) throw new Error('No hay nada para deshacer en esta materia');
    const opuesto = r.modo === 'opuesto';
    if (
      db.evaluaciones.some((x) => x.materia_id === materiaId && x.componente === 'teoria') ||
      (!opuesto && db.asistencias.some((x) => x.materia_id === materiaId && x.componente === 'teoria')) ||
      db.finales.some((f) => f.materia_id === materiaId && !f.cursada_anterior && !r.finales.includes(f.id))
    ) throw new Error('Ya cargaste parciales, asistencia o finales de la nueva cursada: no se puede deshacer');
    db.evaluaciones = db.evaluaciones.filter((x) => !(x.materia_id === materiaId && x.componente === 'teoria')).concat(r.evaluaciones);
    if (!opuesto) db.asistencias = db.asistencias.filter((a) => !(a.materia_id === materiaId && a.componente === 'teoria')).concat(r.asistencia ? [r.asistencia] : []);
    for (const f of db.finales) if (r.finales.includes(f.id)) f.cursada_anterior = false;
    Object.assign(e, { estado: r.estado, nota_final: r.nota_final, nota_desde_final: r.nota_desde_final, promedio_firma: r.promedio_firma, semestre_opuesto: r.semestre_opuesto ?? false, respaldo_recursada: null });
    return;
  }
  const { error } = await supabase.rpc('deshacer_recursada', { p_materia: materiaId });
  lanzar(error);
}

type RespaldoDemo = {
  modo?: 'opuesto'; semestre_opuesto?: boolean;
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
    // Toda cátedra toma al menos dos parciales: si faltan, aparecen pendientes.
    const evaluacionesDb = conParcialesMinimos(evals.filter((e) => e.materia_id === id), (nombre, orden) => ({
      id: idPredefinido(orden), usuario_id: '', materia_id: id, nombre, componente: 'teoria' as const, ponderacion: 1,
      porcentaje: null, puntaje_obtenido: null, puntaje_total: null, rendida: false, fecha: null, orden, created_at: '',
    }));
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

/** Uso de un llamado de Finales por el Recu o la Regu. */
export type UsoLlamadoParcial = { tipo: 'recuperatorio' | 'regularizacion'; periodo: string; llamado: 1 | 2 };

/**
 * Guarda una evaluación de Parciales y, si es un Recu o una Regu rendido, su
 * llamado en el historial de Finales, en UNA transacción (RPC
 * guardar_parcial): o se guardan las dos cosas o ninguna. `id` es estable
 * (nuevoId() al abrir el formulario): reintentar actualiza la misma fila.
 * Con `uso` null y `liberar`, se quita el llamado de Recu o Regu.
 */
export async function guardarParcial(materiaId: string, id: string, datos: NuevaEvaluacion, uso: UsoLlamadoParcial | null, liberar: boolean) {
  if (MODO_DEMO) {
    await transaccionDemo(materiaId, () => {
      const previa = db.evaluaciones.find((e) => e.id === id);
      if (previa) Object.assign(previa, datos);
      else db.evaluaciones.push({ ...datos, id, usuario_id: UID_DEMO, materia_id: materiaId, orden: db.evaluaciones.length, created_at: new Date().toISOString() });
      const actual = db.finales.find((f) => f.materia_id === materiaId && !f.cursada_anterior && (f.tipo === 'recuperatorio' || f.tipo === 'regularizacion'));
      if (uso) {
        if (db.finales.some((f) => f.materia_id === materiaId && !f.cursada_anterior && f.periodo === uso.periodo && f.llamado === uso.llamado && f.id !== actual?.id)) {
          throw new Error('En ese llamado ya cargaste un resultado de final. Elegí otro llamado o cambiá ese resultado en Finales.');
        }
        if (actual) Object.assign(actual, { ...uso, nota: null, porcentaje: null, evaluacion_id: id, version: (actual.version ?? 1) + 1 });
        else db.finales.push({ id: idDemo(), usuario_id: UID_DEMO, materia_id: materiaId, created_at: new Date().toISOString(), cursada_anterior: false, version: 1, origen: 'manual', fecha: null, nota: null, porcentaje: null, evaluacion_id: id, ...uso });
      } else if (liberar && actual) {
        db.finales = db.finales.filter((f) => f.id !== actual.id);
      }
    });
    return;
  }
  const { error } = await supabase.rpc('guardar_parcial', { p_materia: materiaId, p_eval_id: id, p_eval: { ...datos }, p_uso: uso, p_liberar: liberar });
  errorDeFinales(error);
}

/** Borra una evaluación y, con `liberar`, el llamado de Recu o Regu, juntos. */
export async function borrarParcial(materiaId: string, id: string, liberar: boolean) {
  if (MODO_DEMO) {
    await transaccionDemo(materiaId, () => {
      if (liberar) db.finales = db.finales.filter((f) => !(f.materia_id === materiaId && !f.cursada_anterior && (f.tipo === 'recuperatorio' || f.tipo === 'regularizacion')));
      db.evaluaciones = db.evaluaciones.filter((e) => e.id !== id);
    });
    return;
  }
  const { error } = await supabase.rpc('borrar_parcial', { p_eval_id: id, p_liberar: liberar });
  errorDeFinales(error);
}
