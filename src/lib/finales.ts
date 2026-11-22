/**
 * Intentos de examen final (1.º, 2.º y 3.er llamado) y promedios
 * con y sin aplazos. Funciones puras.
 */
import type { EstadoEstudiante, Materia } from './progreso.ts';

export interface IntentoFinal {
  materiaId: string;
  /** 1 a 5 (escala FCQ). 1 = aplazo. */
  nota: number;
  llamado?: number | null;
  periodo?: string | null;
  fecha?: string | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Intentos de una materia en orden: por fecha, y si no hay fecha por periodo y llamado. */
export function intentosDe(materiaId: string, intentos: IntentoFinal[]): IntentoFinal[] {
  return intentos
    .filter((i) => i.materiaId === materiaId)
    .sort((a, b) =>
      (a.fecha ?? '').localeCompare(b.fecha ?? '') ||
      (a.periodo ?? '').localeCompare(b.periodo ?? '') ||
      (a.llamado ?? 0) - (b.llamado ?? 0));
}

/** Mejor nota aprobada (≥ 2) de una materia, o null si todavía no aprobó el final. */
export function notaAprobada(materiaId: string, intentos: IntentoFinal[]): number | null {
  const ok = intentos.filter((i) => i.materiaId === materiaId && i.nota >= 2).map((i) => i.nota);
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
  materias: Pick<Materia, 'id'>[],
  estados: Map<string, EstadoEstudiante>,
  intentos: IntentoFinal[],
): Promedios {
  const delPlan = new Set(materias.map((m) => m.id));
  const notasAprobadas: number[] = [];
  const todas: number[] = [];
  let aplazos = 0;
  for (const id of delPlan) {
    const propios = intentos.filter((i) => i.materiaId === id);
    for (const i of propios) {
      todas.push(i.nota);
      if (i.nota < 2) aplazos++;
    }
    const e = estados.get(id);
    const aprobada = notaAprobada(id, intentos) ?? (e?.estado === 'aprobada' ? e.notaFinal ?? null : null);
    if (aprobada != null) {
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
  /** Porcentaje del examen final (0 a 100), si lo cargó así. */
  porcentaje: number | null;
  /** Nota del llamado (1 a 5). */
  nota: number;
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
