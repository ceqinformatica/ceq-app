/**
 * Tipo de cada clase del horario: Teoría, RP (resolución de problemas) o
 * Laboratorio. Se guarda en horario.tipo_clase; las clases cargadas antes
 * de que existiera quedan sin tipo (null) y no muestran nada.
 */

export type TipoClase = 'teoria' | 'rp' | 'laboratorio';

export interface InfoTipoClase {
  valor: TipoClase;
  /** Para el formulario y el detalle. */
  texto: string;
  /** Para los bloques angostos de la grilla semanal. */
  corto: string;
  /** Nombre de Ionicons. */
  icono: 'book-outline' | 'calculator-outline' | 'flask-outline';
}

export const TIPOS_CLASE: InfoTipoClase[] = [
  { valor: 'teoria', texto: 'Teoría', corto: 'Teo', icono: 'book-outline' },
  { valor: 'rp', texto: 'RP', corto: 'RP', icono: 'calculator-outline' },
  { valor: 'laboratorio', texto: 'Laboratorio', corto: 'Lab', icono: 'flask-outline' },
];

/** El tipo de una clase, o null si no tiene (o si llega un valor que no conocemos). */
export function infoTipoClase(tipo: string | null | undefined): InfoTipoClase | null {
  return TIPOS_CLASE.find((t) => t.valor === tipo) ?? null;
}

/** "Química Analítica I" + laboratorio → "Química Analítica I (Laboratorio)". */
export function nombreConTipo(nombre: string, tipo: string | null | undefined): string {
  const info = infoTipoClase(tipo);
  return info ? `${nombre} (${info.texto})` : nombre;
}

/**
 * Para la imagen que se comparte: las clases agrupadas por día (lunes a
 * domingo, solo los días con clases), cada día ordenado por hora.
 */
export function clasesPorDia<T extends { dia_semana: number; hora_inicio: string; hora_fin: string }>(clases: T[]): { dia: number; clases: T[] }[] {
  const dias = [...new Set(clases.map((c) => c.dia_semana))].sort((a, b) => a - b);
  return dias.map((dia) => ({
    dia,
    clases: clases
      .filter((c) => c.dia_semana === dia)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio) || a.hora_fin.localeCompare(b.hora_fin)),
  }));
}
