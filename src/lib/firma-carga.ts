/**
 * Atajos para cargar la firma sin tanto trabajo. Funciones puras.
 *
 * - Asistencia: alcanza con marcar "Cumplí la asistencia mínima"; no hace
 *   falta contar cuántas clases hubo ni a cuántas fuiste.
 * - Parciales: toda cátedra toma por lo menos dos parciales, así que el
 *   primero y el segundo aparecen solos (pendientes) hasta que se cargan.
 */
import { esRecuperatorio, esRegularizacion } from './reglamento-fcq.ts';

/**
 * Asistencia marcada como cumplida con la casilla. Se guarda como una clase
 * dictada y asistida (100 %) con total 0: el contador nunca guarda un total
 * de 0, así que no se confunde con una asistencia contada a mano.
 */
export const ASISTENCIA_CUMPLIDA = { clases_dictadas: 1, clases_asistidas: 1, clases_totales: 0 } as const;
export const ASISTENCIA_VACIA = { clases_dictadas: 0, clases_asistidas: 0, clases_totales: null } as const;

export function esAsistenciaCumplida(a: { clases_dictadas: number; clases_asistidas: number; clases_totales: number | null } | null | undefined): boolean {
  return !!a && a.clases_dictadas === 1 && a.clases_asistidas === 1 && a.clases_totales === 0;
}

/** Asistencia contada a mano (clases dictadas y asistidas), no con la casilla. */
export function esAsistenciaContada(a: { clases_dictadas: number; clases_asistidas: number; clases_totales: number | null } | null | undefined): boolean {
  return !!a && a.clases_dictadas > 0 && !esAsistenciaCumplida(a);
}

/** Mínimo de parciales por cátedra. */
export const PARCIALES_MINIMOS = 2;
const NOMBRES = ['Primer parcial', 'Segundo parcial'];
const PREFIJO = 'predefinido:';

/** Parcial teórico común (no recuperatorio ni regularización). */
const esParcialTeorico = (e: { nombre: string; componente: string }) => e.componente === 'teoria' && !esRecuperatorio(e) && !esRegularizacion(e);

/** Parcial que la app agrega sola y todavía no se guardó. */
export const esPredefinida = (e: { id: string }) => e.id.startsWith(PREFIJO);

/**
 * Agrega el primer y el segundo parcial (pendientes) si la materia tiene
 * menos de dos parciales teóricos. Con uno cargado se agrega solo el segundo.
 * No se guardan: al cargarles la nota se crean de verdad.
 */
export function conParcialesMinimos<T extends { id: string; nombre: string; componente: string; rendida: boolean }>(
  evaluaciones: T[],
  crear: (nombre: string, orden: number) => T,
): T[] {
  const cantidad = evaluaciones.filter(esParcialTeorico).length;
  if (cantidad >= PARCIALES_MINIMOS) return evaluaciones;
  // Nombres que todavía no existen (si cargó primero el segundo, falta el primero).
  const existentes = new Set(evaluaciones.map((e) => e.nombre.trim().toLowerCase()));
  const libres = NOMBRES.filter((n) => !existentes.has(n.toLowerCase()));
  const faltan = libres.slice(libres.length - (PARCIALES_MINIMOS - cantidad)).map((n, i) => crear(n, cantidad + i));
  // Los parciales van antes del laboratorio, el recuperatorio y la regularización.
  const ultimoParcial = evaluaciones.reduce((u, e, i) => (esParcialTeorico(e) ? i : u), -1);
  return [...evaluaciones.slice(0, ultimoParcial + 1), ...faltan, ...evaluaciones.slice(ultimoParcial + 1)];
}

/** Id de un parcial predefinido (no existe en la base). */
export const idPredefinido = (orden: number) => `${PREFIJO}${orden}`;
