/**
 * Cálculo de firma de una materia.
 *
 * Funciones puras, sin dependencias de React ni de Supabase, para poder
 * probarlas con `npm test`. Todos los porcentajes van de 0 a 100.
 */

export type Componente = 'teoria' | 'laboratorio';

export interface Evaluacion {
  nombre: string;
  componente: Componente;
  /** Peso de la evaluación dentro de su componente (ej. 30 para 30 %). */
  ponderacion: number;
  /** Porcentaje cargado directo. Tiene prioridad sobre el puntaje. */
  porcentaje?: number | null;
  puntajeObtenido?: number | null;
  puntajeTotal?: number | null;
  /** false = todavía no se rindió (cuenta para "cuánto me falta"). */
  rendida: boolean;
}

export interface Asistencia {
  clasesDictadas: number;
  clasesAsistidas: number;
  /** Total previsto del semestre, si se conoce. Permite saber cuántas faltas quedan. */
  clasesTotales?: number | null;
}

export interface ReglaFirma {
  minimoTeoria: number;
  minimoLaboratorio?: number | null;
  minimoAsistencia: number;
  minimoAsistenciaLab?: number | null;
  /** 'separado': cada componente con su mínimo. 'combinado': una sola nota con el lab pesando pesoLaboratorio %. */
  modoLaboratorio: 'separado' | 'combinado';
  pesoLaboratorio?: number | null;
}

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'sin_datos';

export interface ResultadoComponente {
  /** Promedio ponderado de lo rendido, o null si no hay nada rendido. */
  actual: number | null;
  minimo: number;
  /** Promedio que necesita en lo que falta rendir para llegar al mínimo. null si no queda nada por rendir. */
  necesario: number | null;
  /** Ya alcanzó el mínimo pase lo que pase en lo que falta. */
  asegurado: boolean;
  /** Ya no alcanza aunque saque 100 en lo que falta. */
  imposible: boolean;
  semaforo: Semaforo;
}

export interface ResultadoAsistencia {
  porcentaje: number | null;
  minimo: number;
  /** Faltas que todavía puede tener sin perder la firma (si se conoce el total de clases). */
  faltasDisponibles: number | null;
  semaforo: Semaforo;
}

export interface ResultadoFirma {
  teoria: ResultadoComponente;
  laboratorio: ResultadoComponente | null;
  asistencia: ResultadoAsistencia;
  asistenciaLab: ResultadoAsistencia | null;
  semaforo: Semaforo;
  firma: boolean;
}

/** Margen en puntos sobre el mínimo para considerar "en riesgo" (amarillo). */
export const MARGEN_RIESGO = 5;

const redondear = (n: number, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec;

/** Porcentaje de una evaluación: directo, o puntaje obtenido / total × 100. */
export function porcentajeEvaluacion(e: Pick<Evaluacion, 'porcentaje' | 'puntajeObtenido' | 'puntajeTotal'>): number | null {
  if (esNumero(e.porcentaje)) return clamp(e.porcentaje);
  if (esNumero(e.puntajeObtenido) && esNumero(e.puntajeTotal) && e.puntajeTotal > 0) {
    return clamp((e.puntajeObtenido / e.puntajeTotal) * 100);
  }
  return null;
}

/** Descarta null, undefined, NaN e Infinity (ej. un campo mal tipeado convertido con Number()). */
function esNumero(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Peso válido: número finito y mayor que cero. */
const pesoValido = (w: number) => esNumero(w) && w > 0;

function clamp(n: number) {
  return Math.min(100, Math.max(0, n));
}

/** Promedio ponderado: Σ(p·w) / Σw. Las evaluaciones sin porcentaje no cuentan. */
export function promedioPonderado(evals: Evaluacion[]): number | null {
  let suma = 0;
  let pesos = 0;
  for (const e of evals) {
    const p = porcentajeEvaluacion(e);
    if (!e.rendida || p == null || !pesoValido(e.ponderacion)) continue;
    suma += p * e.ponderacion;
    pesos += e.ponderacion;
  }
  return pesos > 0 ? redondear(suma / pesos) : null;
}

/**
 * Evalúa un componente (teoría o laboratorio).
 *
 * "Necesario" = (M · Σw_todas − Σ p·w_rendidas) / Σw_pendientes
 */
export function evaluarComponente(evals: Evaluacion[], minimo: number): ResultadoComponente {
  let sumaRendida = 0;
  let pesoRendido = 0;
  let pesoPendiente = 0;
  for (const e of evals) {
    if (!pesoValido(e.ponderacion)) continue;
    const p = porcentajeEvaluacion(e);
    if (e.rendida && p != null) {
      sumaRendida += p * e.ponderacion;
      pesoRendido += e.ponderacion;
    } else {
      pesoPendiente += e.ponderacion;
    }
  }
  const pesoTotal = pesoRendido + pesoPendiente;
  const actual = pesoRendido > 0 ? redondear(sumaRendida / pesoRendido) : null;

  if (pesoTotal === 0) {
    return { actual: null, minimo, necesario: null, asegurado: false, imposible: false, semaforo: 'sin_datos' };
  }

  const necesarioBruto = pesoPendiente > 0 ? (minimo * pesoTotal - sumaRendida) / pesoPendiente : null;
  const necesario = necesarioBruto == null ? null : redondear(Math.max(0, necesarioBruto));
  // Asegurado: aun sacando 0 en lo pendiente llega al mínimo.
  const asegurado = sumaRendida >= minimo * pesoTotal;
  // Imposible: aun sacando 100 en lo pendiente no llega.
  const imposible = sumaRendida + 100 * pesoPendiente < minimo * pesoTotal;

  let semaforo: Semaforo;
  if (asegurado) semaforo = 'verde';
  else if (imposible) semaforo = 'rojo';
  else if (pesoPendiente === 0) semaforo = actual != null && actual >= minimo ? 'verde' : 'rojo';
  else if (necesario != null && necesario > 100 - MARGEN_RIESGO) semaforo = 'amarillo';
  else if (actual == null) semaforo = 'sin_datos';
  else semaforo = actual >= minimo + MARGEN_RIESGO ? 'verde' : 'amarillo';

  return { actual, minimo, necesario, asegurado, imposible, semaforo };
}

export function evaluarAsistencia(a: Asistencia | null | undefined, minimo: number): ResultadoAsistencia {
  if (!a || a.clasesDictadas <= 0) {
    return { porcentaje: null, minimo, faltasDisponibles: null, semaforo: 'sin_datos' };
  }
  const porcentaje = redondear((a.clasesAsistidas / a.clasesDictadas) * 100);
  let faltasDisponibles: number | null = null;
  if (a.clasesTotales != null && a.clasesTotales >= a.clasesDictadas) {
    const minimasAsistidas = Math.ceil((minimo / 100) * a.clasesTotales - 1e-9);
    const faltasPermitidas = a.clasesTotales - minimasAsistidas;
    const faltasActuales = a.clasesDictadas - a.clasesAsistidas;
    faltasDisponibles = faltasPermitidas - faltasActuales;
  }
  let semaforo: Semaforo;
  if (faltasDisponibles != null) {
    semaforo = faltasDisponibles < 0 ? 'rojo' : faltasDisponibles <= 1 ? 'amarillo' : 'verde';
  } else {
    semaforo = porcentaje < minimo ? 'rojo' : porcentaje < minimo + MARGEN_RIESGO ? 'amarillo' : 'verde';
  }
  return { porcentaje, minimo, faltasDisponibles, semaforo };
}

const ORDEN: Semaforo[] = ['rojo', 'amarillo', 'sin_datos', 'verde'];
function peor(...s: Semaforo[]): Semaforo {
  return s.reduce((a, b) => (ORDEN.indexOf(b) < ORDEN.indexOf(a) ? b : a), 'verde' as Semaforo);
}

/** Resultado completo de firma de una materia. */
export function evaluarFirma(params: {
  regla: ReglaFirma;
  tieneLaboratorio: boolean;
  evaluaciones: Evaluacion[];
  asistencia?: Asistencia | null;
  asistenciaLab?: Asistencia | null;
}): ResultadoFirma {
  const { regla, tieneLaboratorio, evaluaciones } = params;
  const teoriaEvals = evaluaciones.filter((e) => e.componente === 'teoria');
  const labEvals = evaluaciones.filter((e) => e.componente === 'laboratorio');

  let teoria: ResultadoComponente;
  let laboratorio: ResultadoComponente | null = null;

  if (tieneLaboratorio && regla.modoLaboratorio === 'combinado') {
    // Una sola nota: el laboratorio pesa pesoLaboratorio % del total.
    const pesoLab = clamp(regla.pesoLaboratorio ?? 0);
    const escalar = (evs: Evaluacion[], peso: number, nombre: string): Evaluacion[] => {
      if (peso <= 0) return [];
      const validas = evs.filter((e) => pesoValido(e.ponderacion));
      const total = validas.reduce((s, e) => s + e.ponderacion, 0);
      // Sin evaluaciones cargadas, el componente sigue pesando: cuenta como pendiente
      // para que no se dé por firmada la materia solo con la otra parte.
      if (total <= 0) return [{ nombre, componente: 'teoria', ponderacion: peso, rendida: false }];
      return validas.map((e) => ({ ...e, ponderacion: (e.ponderacion / total) * peso }));
    };
    const combinadas = [...escalar(teoriaEvals, 100 - pesoLab, 'Teoría'), ...escalar(labEvals, pesoLab, 'Laboratorio')];
    teoria = evaluarComponente(combinadas, regla.minimoTeoria);
  } else {
    teoria = evaluarComponente(teoriaEvals, regla.minimoTeoria);
    if (tieneLaboratorio) {
      laboratorio = evaluarComponente(labEvals, regla.minimoLaboratorio ?? regla.minimoTeoria);
    }
  }

  const asistencia = evaluarAsistencia(params.asistencia, regla.minimoAsistencia);
  const asistenciaLab =
    tieneLaboratorio && regla.minimoAsistenciaLab != null
      ? evaluarAsistencia(params.asistenciaLab, regla.minimoAsistenciaLab)
      : null;

  const partes = [teoria.semaforo, asistencia.semaforo];
  if (laboratorio) partes.push(laboratorio.semaforo);
  if (asistenciaLab) partes.push(asistenciaLab.semaforo);
  const semaforo = peor(...partes);

  const cumple = (c: ResultadoComponente | null) =>
    c == null || c.asegurado || (c.necesario == null && c.actual != null && c.actual >= c.minimo);
  const cumpleAsis = (a: ResultadoAsistencia | null) => a == null || (a.porcentaje != null && a.porcentaje >= a.minimo);
  const firma = cumple(teoria) && cumple(laboratorio) && cumpleAsis(asistencia) && cumpleAsis(asistenciaLab);

  return { teoria, laboratorio, asistencia, asistenciaLab, semaforo, firma };
}

/**
 * Pesos automáticos: todas las evaluaciones de un mismo componente pesan
 * lo mismo (tres parciales → 33,3 % cada uno). Así el estudiante no tiene
 * que cargar ponderaciones.
 */
export function pesosIguales(evals: Evaluacion[]): Evaluacion[] {
  return evals.map((e) => ({ ...e, ponderacion: 1 }));
}

/**
 * Promedio de firma: con todas las notas cargadas, si teoría y laboratorio
 * llegan a su mínimo, el promedio de los dos (o solo teoría si no hay laboratorio). null mientras
 * no se cumpla.
 */
export function promedioFirma(r: Pick<ResultadoFirma, 'teoria' | 'laboratorio'>): number | null {
  // Solo con todas las notas cargadas: si queda algo pendiente, el promedio
  // todavía puede cambiar (aunque la firma ya esté asegurada).
  const llega = (c: ResultadoComponente | null) => c == null || (c.actual != null && c.actual >= c.minimo && c.necesario == null);
  if (!llega(r.teoria) || !llega(r.laboratorio) || r.teoria.actual == null) return null;
  const lab = r.laboratorio?.actual ?? null;
  return redondear(lab == null ? r.teoria.actual : (r.teoria.actual + lab) / 2);
}
