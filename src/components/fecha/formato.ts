/**
 * Textos de fecha y hora que usan los formularios: "25/11/2026" y "18:30".
 * Los selectores devuelven siempre este formato, así el resto de la app no
 * cambia la forma en que lee las fechas.
 */
const dos = (n: number) => String(n).padStart(2, '0');

export const textoFecha = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;
export const textoHora = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;

/** "25/11/2026" o "25/11" → Date a las 00:00, o null. */
export function leerTextoFecha(t: string): Date | null {
  const m = t.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?$/);
  if (!m) return null;
  const d = new Date(m[3] ? Number(m[3]) : new Date().getFullYear(), Number(m[2]) - 1, Number(m[1]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** "18:30" → Date de hoy a esa hora, o null. */
export function leerTextoHora(t: string): Date | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

/** "mar 25 nov 2026" para mostrar en el campo. */
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fechaLegible = (d: Date) => `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;

export type ModoFecha = 'date' | 'time';

export interface PropsControl {
  modo: ModoFecha;
  /** "DD/MM/AAAA" o "HH:MM"; vacío = sin elegir. */
  valor: string;
  onCambio: (v: string) => void;
  etiqueta: string;
  placeholder?: string;
  minimo?: Date;
}
