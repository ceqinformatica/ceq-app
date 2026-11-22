/**
 * Reglas del Reglamento de Régimen Académico de la FCQ-UNA
 * (Res. CSU 0108-00-2024, Art. 43 a 58).
 *
 * Funciones puras. Se usan junto con firma.ts: REGLA_FCQ es la regla de
 * firma por defecto cuando el plan o la materia no tienen una propia.
 */
import { porcentajeEvaluacion, type Evaluacion, type ReglaFirma, type ResultadoComponente } from './firma.ts';

/**
 * Habilitación a final (Art. 43): teoría ≥ 50 %, prácticos ≥ 60 %,
 * asistencia a teoría ≥ 60 % y 100 % de las prácticas cumplidas.
 */
export const REGLA_FCQ: ReglaFirma = {
  minimoTeoria: 50,
  minimoLaboratorio: 60,
  minimoAsistencia: 60,
  minimoAsistenciaLab: 100,
  modoLaboratorio: 'separado',
  pesoLaboratorio: null,
};

/** Recuperación (Art. 46): teórico entre 30 % y 49,99 %. */
export const RECUPERACION_DESDE = 30;
/** Nota mínima en la recuperación para que cuente. */
export const RECUPERACION_MINIMO = 60;
/** PG mínimo después de recuperar. */
export const PG_MINIMO_TRAS_RECUPERAR = 50;
/** El examen final debe ser ≥ 60 % para ponderarse (Art. 57). */
export const FINAL_MINIMO = 60;
/** Vigencia de la firma en periodos académicos (Art. 49). */
export const VIGENCIA_FIRMA_PERIODOS = 2;
/** Máximo de asignaturas por semestre (Art. 9). */
export const MAX_MATERIAS_SEMESTRE = 7;

/** ¿Puede rendir recuperación con este promedio teórico? */
export function puedeRecuperar(teoria: Pick<ResultadoComponente, 'actual' | 'minimo'> | null | undefined): boolean {
  const t = teoria?.actual;
  return t != null && t >= RECUPERACION_DESDE && t < (teoria?.minimo ?? REGLA_FCQ.minimoTeoria);
}

/**
 * Promedio teórico después de la recuperación: si la recuperación es ≥ 60 %
 * reemplaza el parcial teórico más bajo. `parciales` son los porcentajes de
 * los parciales teóricos con su ponderación.
 */
export function teoriaTrasRecuperar(
  parciales: { porcentaje: number; ponderacion: number }[],
  recuperacion: number,
): number | null {
  const validos = parciales.filter((p) => p.ponderacion > 0);
  if (!validos.length) return null;
  const lista = validos.map((p) => ({ ...p }));
  if (recuperacion >= RECUPERACION_MINIMO) {
    let iMin = 0;
    lista.forEach((p, i) => {
      if (p.porcentaje < lista[iMin].porcentaje) iMin = i;
    });
    lista[iMin].porcentaje = Math.max(lista[iMin].porcentaje, recuperacion);
  }
  const pesos = lista.reduce((s, p) => s + p.ponderacion, 0);
  return redondear(lista.reduce((s, p) => s + p.porcentaje * p.ponderacion, 0) / pesos);
}

/** Una evaluación es el examen de recuperación si su nombre lo dice. */
export const esRecuperatorio = (e: { nombre: string; componente: string }) =>
  e.componente === 'teoria' && /recuperat|recuperaci/i.test(e.nombre);

/**
 * Examen de recuperación (Art. 46) aplicado a las evaluaciones de una
 * materia. Si ya se rindieron todos los parciales teóricos, su promedio
 * quedó entre 30 % y el mínimo, y la recuperación llegó a 60 %, esa nota
 * reemplaza el parcial teórico más bajo. La recuperación nunca cuenta como
 * un parcial más: se saca de la lista. `recuperado` indica que se aplicó;
 * en ese caso, para habilitar alcanza con PG ≥ 50 %.
 */
export function aplicarRecuperatorio<E extends Evaluacion>(evals: E[], minimoTeoria = REGLA_FCQ.minimoTeoria): { evaluaciones: E[]; recuperado: boolean } {
  const recs = evals.filter(esRecuperatorio);
  const resto = evals.filter((e) => !esRecuperatorio(e));
  if (!recs.length) return { evaluaciones: evals, recuperado: false };
  const teoricas = resto.filter((e) => e.componente === 'teoria');
  const notas = teoricas.map((e) => (e.rendida ? porcentajeEvaluacion(e) : null));
  const rec = Math.max(...recs.map((e) => (e.rendida ? porcentajeEvaluacion(e) ?? -1 : -1)));
  if (!teoricas.length || notas.some((n) => n == null) || rec < RECUPERACION_MINIMO) return { evaluaciones: resto, recuperado: false };
  const prom = (notas as number[]).reduce((a, b) => a + b, 0) / notas.length;
  if (prom < RECUPERACION_DESDE || prom >= minimoTeoria) return { evaluaciones: resto, recuperado: false };
  let iMin = 0;
  notas.forEach((n, i) => { if ((n as number) < (notas[iMin] as number)) iMin = i; });
  const bajo = teoricas[iMin];
  const evaluaciones = resto.map((e) =>
    e === bajo ? { ...e, porcentaje: Math.max(notas[iMin] as number, rec), puntajeObtenido: null, puntajeTotal: null } : e,
  );
  return { evaluaciones, recuperado: true };
}

/** Promedio General (Art. 44): (teórico + práctico) / 2; sin prácticos, solo el teórico. */
export function promedioGeneralFcq(teoria: number | null, practico: number | null): number | null {
  if (teoria == null) return null;
  if (practico == null) return teoria;
  return redondear((teoria + practico) / 2);
}

export type Nota = 1 | 2 | 3 | 4 | 5;

/** Escala de la FCQ (Art. 58), con redondeo desde 0,5. */
export function notaDesdeRendimiento(rendimiento: number): Nota {
  const r = Math.round(rendimiento);
  if (r >= 91) return 5;
  if (r >= 81) return 4;
  if (r >= 71) return 3;
  if (r >= 60) return 2;
  return 1;
}

export const CONCEPTO: Record<Nota, string> = {
  1: 'Insuficiente',
  2: 'Aceptable',
  3: 'Bueno',
  4: 'Distinguido',
  5: 'Sobresaliente',
};

export interface CalificacionFinal {
  /** Rendimiento ponderado 0 a 100, o null si el final no llegó al 60 %. */
  rendimiento: number | null;
  nota: Nota;
  aprobado: boolean;
}

/** Calificación final (Art. 57): 0,40 × PG + 0,60 × EF, con EF ≥ 60 %. */
export function calificacionFinal(pg: number, examenFinal: number): CalificacionFinal {
  if (examenFinal < FINAL_MINIMO) return { rendimiento: null, nota: 1, aprobado: false };
  const rendimiento = redondear(0.4 * pg + 0.6 * examenFinal);
  const nota = notaDesdeRendimiento(rendimiento);
  return { rendimiento, nota, aprobado: nota >= 2 };
}

/** Nota mínima que necesita en el final para aprobar con nota `objetivo` (2 por defecto). null si no alcanza. */
export function finalNecesario(pg: number, objetivo: Nota = 2): number | null {
  const umbral = { 1: 0, 2: 59.5, 3: 70.5, 4: 80.5, 5: 90.5 }[objetivo];
  const ef = Math.max(FINAL_MINIMO, (umbral - 0.4 * pg) / 0.6);
  return ef > 100 ? null : Math.ceil(ef * 100) / 100;
}

function redondear(n: number, dec = 2) {
  return Math.round(n * 10 ** dec) / 10 ** dec;
}
