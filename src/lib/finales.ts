/**
 * Intentos de examen final (1.º, 2.º y 3.er llamado) y promedios
 * con y sin aplazos. Funciones puras.
 */
import { esSeminario, type EstadoEstudiante, type Materia } from './progreso.ts';
import type { TipoExamen } from './tipos-db.ts';

export interface IntentoFinal {
  materiaId: string;
  /** 1 a 5 (escala FCQ). 1 = aplazo. */
  nota: number;
  llamado?: number | null;
  periodo?: string | null;
  fecha?: string | null;
  /** Regularización o recuperatorio: llamado usado sin nota de final, no cuenta. */
  tipo?: TipoExamen;
}

/** Solo los exámenes finales cuentan para aprobar y para los promedios. */
const esFinal = (i: Pick<IntentoFinal, 'tipo'>) => (i.tipo ?? 'final') === 'final';

export { esSeminario };

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Intentos de una materia en orden: por fecha, y si no hay fecha por periodo y llamado. */
export function intentosDe(materiaId: string, intentos: IntentoFinal[]): IntentoFinal[] {
  return intentos
    .filter((i) => i.materiaId === materiaId && esFinal(i))
    .sort((a, b) =>
      (a.fecha ?? '').localeCompare(b.fecha ?? '') ||
      (a.periodo ?? '').localeCompare(b.periodo ?? '') ||
      (a.llamado ?? 0) - (b.llamado ?? 0));
}

/** Mejor nota aprobada (≥ 2) de una materia, o null si todavía no aprobó el final. */
export function notaAprobada(materiaId: string, intentos: IntentoFinal[]): number | null {
  const ok = intentos.filter((i) => i.materiaId === materiaId && esFinal(i) && i.nota >= 2).map((i) => i.nota);
  return ok.length ? Math.max(...ok) : null;
}

export interface Promedios {
  /** Solo la nota con la que aprobó cada materia. */
  sinAplazos: number | null;
  /** Todas las notas de final, incluidos los aplazos (1). */
  conAplazos: number | null;
  aplazos: number;
}

/**
 * Promedios de la carrera. Las materias aprobadas sin intentos cargados
 * (por ejemplo, marcadas en bloque con su nota) cuentan su nota final una vez.
 */
export function promedios(
  materias: (Pick<Materia, 'id'> & { nombre?: string })[],
  estados: Map<string, EstadoEstudiante>,
  intentos: IntentoFinal[],
): Promedios {
  // Los seminarios no llevan nota: no entran en el promedio.
  const delPlan = new Set(materias.filter((m) => !m.nombre || !esSeminario(m.nombre)).map((m) => m.id));
  const notasAprobadas: number[] = [];
  const todas: number[] = [];
  let aplazos = 0;
  for (const id of delPlan) {
    const propios = intentos.filter((i) => i.materiaId === id && esFinal(i));
    for (const i of propios) {
      todas.push(i.nota);
      if (i.nota < 2) aplazos++;
    }
    const e = estados.get(id);
    const aprobada = notaAprobada(id, propios) ?? (e?.estado === 'aprobada' ? e.notaFinal ?? null : null);
    // Solo notas de aprobación válidas (2 a 5): una nota mal cargada no entra al promedio.
    if (aprobada != null && aprobada >= 2 && aprobada <= 5) {
      notasAprobadas.push(aprobada);
      if (!propios.some((i) => i.nota >= 2)) todas.push(aprobada);
    }
  }
  const prom = (xs: number[]) => (xs.length ? redondear(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  return { sinAplazos: prom(notasAprobadas), conAplazos: prom(todas), aplazos };
}

/** Periodo académico de una fecha: "2026-1" (feb–jul) o "2026-2" (ago–dic). Enero cuenta como el 2.º del año anterior. */
export function periodoDe(fecha: Date = new Date()): string {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth(); // 0 = enero
  if (mes === 0) return `${anio - 1}-2`;
  return `${anio}-${mes <= 6 ? 1 : 2}`;
}

export interface LlamadoCargado {
  llamado: 1 | 2 | 3;
  /** Regularización o recuperatorio: el llamado queda usado, sin nota. */
  tipo?: TipoExamen;
  /** Porcentaje del examen final (0 a 100), si lo cargó así. */
  porcentaje: number | null;
  /** Nota del llamado (1 a 5); null si se usó para regularizar. */
  nota: number | null;
}

/**
 * Nota de un llamado: con el porcentaje del final y el promedio de firma
 * (0,4 × firma + 0,6 × final, el final tiene que llegar a 60 %), o la nota
 * cargada directo. null si el llamado quedó vacío.
 */
export function notaDelLlamado(
  firma: number | null,
  porcentaje: number | null,
  notaDirecta: number | null,
  calcular: (pg: number, ef: number) => { nota: number },
): number | null {
  if (porcentaje != null && firma != null) return calcular(firma, porcentaje).nota;
  if (notaDirecta != null && notaDirecta >= 1 && notaDirecta <= 5) return Math.round(notaDirecta);
  return null;
}

/** Aplazos que obligan a recursar (Art. 62). */
export const APLAZOS_PARA_RECURSAR = 3;

/**
 * Aplazos de la cursada actual (los intentos de antes de recursar no
 * cuentan). Con tres aplazos sin aprobar tiene que volver a cursar.
 */
export function aplazosDeLaCursada(
  finales: { nota: number | null; tipo?: string | null; cursada_anterior?: boolean | null }[],
): { aplazos: number; debeRecursar: boolean } {
  const propios = finales.filter((f) => (f.tipo ?? 'final') === 'final' && f.nota != null && !f.cursada_anterior);
  const aplazos = propios.filter((f) => (f.nota as number) < 2).length;
  const aprobo = propios.some((f) => (f.nota as number) >= 2);
  return { aplazos, debeRecursar: !aprobo && aplazos >= APLAZOS_PARA_RECURSAR };
}

/**
 * Vigencia de la firma (Art. 49, 50 y 62): la habilitación dura dos periodos
 * académicos en que se ofrece la materia. Si en la cursada actual ya se usaron
 * llamados (final, Recu o Regu) en dos periodos distintos sin aprobar, la
 * firma venció: un llamado en un tercer periodo ya no corresponde y hay que
 * volver a cursar. Solo cuenta los periodos cargados, así que no avisa de más
 * si la materia no se ofreció en algún semestre.
 */
export function firmaVencida(
  finales: { nota: number | null; tipo?: string | null; periodo?: string | null; cursada_anterior?: boolean | null }[],
  periodoActual: string,
): boolean {
  const propios = finales.filter((f) => !f.cursada_anterior);
  if (propios.some((f) => (f.tipo ?? 'final') === 'final' && f.nota != null && f.nota >= 2)) return false;
  const periodos = [...new Set(propios.map((f) => f.periodo).filter((p): p is string => !!p))].sort();
  if (periodos.length < 2) return false;
  // Venció si ya hay un tercer periodo cargado o si el que se mira es posterior a los dos usados.
  return periodos.length > 2 || periodoActual > periodos[1];
}
