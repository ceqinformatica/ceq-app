/**
 * Cálculos del horario semanal: minutos, choques entre clases y cómo
 * acomodar los bloques en la grilla de la semana.
 */

export interface ClaseHora {
  id: string;
  dia_semana: number; // 1 = lunes … 7 = domingo
  hora_inicio: string; // "07:30" o "07:30:00"
  hora_fin: string;
}

/** "07:30" o "07:30:00" → 450. */
export function minutos(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 450 → "07:30". */
export function textoMinutos(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "HH:MM" del selector → "HH:MM:00" para la base, o null si no es una hora. */
export function horaParaBase(t: string): string | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(t.trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:00` : null;
}

/** Dos clases chocan si son el mismo día y sus horarios se pisan (tocarse en el borde no cuenta). */
export function chocan(a: ClaseHora, b: ClaseHora): boolean {
  return a.dia_semana === b.dia_semana
    && minutos(a.hora_inicio) < minutos(b.hora_fin)
    && minutos(b.hora_inicio) < minutos(a.hora_fin);
}

/** Clases de la lista que chocan con la nueva (sin contarse a sí misma si es una edición). */
export function choquesCon<T extends ClaseHora>(nueva: ClaseHora, clases: T[]): T[] {
  return clases.filter((c) => c.id !== nueva.id && chocan(nueva, c));
}

/**
 * Rango de horas que muestra la grilla: de la hora en punto anterior a la
 * primera clase a la hora en punto siguiente a la última. Sin clases, 7 a 13.
 */
export function rangoSemana(clases: ClaseHora[]): { desde: number; hasta: number } {
  if (clases.length === 0) return { desde: 7 * 60, hasta: 13 * 60 };
  const desde = Math.floor(Math.min(...clases.map((c) => minutos(c.hora_inicio))) / 60) * 60;
  const hasta = Math.ceil(Math.max(...clases.map((c) => minutos(c.hora_fin))) / 60) * 60;
  return { desde, hasta: Math.max(hasta, desde + 60) };
}

export interface Bloque<T> {
  clase: T;
  /** Columna dentro del día (0, 1, …) cuando hay clases que se pisan. */
  columna: number;
  /** Cuántas columnas comparte con las que se pisa. */
  columnas: number;
}

/**
 * Acomoda las clases de un día en columnas para que las que se pisan
 * queden lado a lado en lugar de taparse.
 */
export function acomodarDia<T extends ClaseHora>(clases: T[]): Bloque<T>[] {
  const orden = [...clases].sort((a, b) => minutos(a.hora_inicio) - minutos(b.hora_inicio) || minutos(a.hora_fin) - minutos(b.hora_fin));
  const res: Bloque<T>[] = [];
  let grupo: Bloque<T>[] = [];
  let finGrupo = -1;
  const cerrar = () => {
    const n = Math.max(0, ...grupo.map((b) => b.columna + 1));
    grupo.forEach((b) => { b.columnas = n; });
    res.push(...grupo);
    grupo = [];
  };
  for (const c of orden) {
    const ini = minutos(c.hora_inicio);
    if (grupo.length && ini >= finGrupo) cerrar();
    // Primera columna libre: la que tiene su última clase terminada.
    const ocupadas = new Set(grupo.filter((b) => minutos(b.clase.hora_fin) > ini).map((b) => b.columna));
    let col = 0;
    while (ocupadas.has(col)) col++;
    grupo.push({ clase: c, columna: col, columnas: 1 });
    finGrupo = Math.max(finGrupo, minutos(c.hora_fin));
  }
  if (grupo.length) cerrar();
  return res;
}

/** Opciones de aviso antes de clase, en minutos (null = sin aviso). */
export const OPCIONES_AVISO: (number | null)[] = [null, 10, 15, 30, 60];

export function textoAviso(min: number | null | undefined): string {
  if (min == null) return 'Sin aviso';
  if (min % 60 === 0) return min === 60 ? '1 hora antes' : `${min / 60} horas antes`;
  return `${min} min antes`;
}
