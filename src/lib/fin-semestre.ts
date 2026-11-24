/**
 * Fin del semestre que elige cada estudiante (perfiles.fin_clases, AAAA-MM-DD):
 * es el último día de clases. Desde el día siguiente el horario queda vacío
 * (la base lo borra una vez por día) y no llegan más avisos de clase.
 */

/** true desde el día siguiente al último día de clases. */
export function semestreTerminado(fin: string | null | undefined, hoy: string): boolean {
  return !!fin && hoy > fin;
}

/** "12/07/2027" → "2027-07-12", o null si no es una fecha válida. */
export function isoDesdeTexto(t: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t.trim());
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "2027-07-12" → "12/07/2027" (el formato del selector de fecha). */
export function textoDesdeIso(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2027-07-12" → "12 de julio". */
export function fechaLarga(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

/** Detalle de la opción "Fin del semestre" en la agenda. */
export function detalleFinSemestre(fin: string | null | undefined, hoy: string): string {
  if (!fin) return 'Elegí tu último día de clases: después tu horario queda vacío y dejan de llegarte avisos.';
  if (semestreTerminado(fin, hoy)) return `Terminó el ${fechaLarga(fin)}. Tu horario quedó vacío para el próximo semestre.`;
  return `Último día de clases: ${fechaLarga(fin)}. Al día siguiente se vacía tu horario.`;
}
