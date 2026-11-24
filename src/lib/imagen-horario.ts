/**
 * Imagen del horario para compartir (WhatsApp, historias): paletas de
 * colores, modo claro u oscuro y las cuentas de la grilla. La imagen se
 * arma a propósito en formato 9:16 (1080 × 1920), no es una captura de
 * la pantalla.
 */

export type ModoImagen = 'claro' | 'oscuro';

export interface PaletaImagen {
  id: string;
  nombre: string;
  /** Un color por materia, en orden (si hay más materias, se repiten). */
  tonos: string[];
}

export const PALETAS_IMAGEN: PaletaImagen[] = [
  { id: 'ceq', nombre: 'CEQ', tonos: ['#1E5BB0', '#2A8FCC', '#0F5F94', '#5B8FD0', '#3F5168', '#1677B0', '#7DA7D9', '#24467A'] },
  { id: 'pastel', nombre: 'Pastel', tonos: ['#F6B8C8', '#AFCFF2', '#CDB9F2', '#FFE08A', '#A9E2DA', '#F7C9A8', '#D6E7A6', '#E2C6EE'] },
  { id: 'lavanda', nombre: 'Lavanda', tonos: ['#6D4FC2', '#9A7FE0', '#4B3A8F', '#B9A2EE', '#8457B8', '#5E6FD6', '#C08AD8', '#3D3170'] },
  { id: 'rosa', nombre: 'Rosa', tonos: ['#D6457A', '#F08CAE', '#A8325E', '#F4B3C8', '#C2589A', '#E56B6B', '#8E3B74', '#F7A1A1'] },
  { id: 'vivos', nombre: 'Vivos', tonos: ['#D3343B', '#3E63DD', '#8E4EC6', '#F5B700', '#0E8C7E', '#D63F80', '#0077D6', '#6E56CF'] },
  { id: 'grises', nombre: 'Grises', tonos: ['#2F3A4A', '#6B7886', '#4A5566', '#9AA5B1', '#1F2733', '#7E8A97', '#58636F', '#B4BDC7'] },
];

export const PALETA_PREDETERMINADA = 'ceq';

export function paletaPorId(id: string | null | undefined): PaletaImagen {
  return PALETAS_IMAGEN.find((p) => p.id === id) ?? PALETAS_IMAGEN[0];
}

/** Colores fijos de la imagen (no dependen del tema de la app). */
export interface FondoImagen {
  fondo: string;
  tarjeta: string;
  texto: string;
  textoSuave: string;
  linea: string;
}

export const FONDOS_IMAGEN: Record<ModoImagen, FondoImagen> = {
  claro: { fondo: '#EEF3FA', tarjeta: '#FFFFFF', texto: '#14213A', textoSuave: '#5B6880', linea: '#E3EAF4' },
  oscuro: { fondo: '#0D1420', tarjeta: '#172234', texto: '#F1F5FB', textoSuave: '#A3B1C6', linea: '#26344A' },
};

function canales(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const largo = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(largo, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminancia relativa (WCAG). */
export function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const TEXTO_OSCURO = '#14213A';
const TEXTO_CLARO = '#FFFFFF';

/** Texto blanco u oscuro sobre un color, el que se lea mejor. */
export function textoSobre(fondo: string): string {
  return contraste(fondo, TEXTO_CLARO) >= contraste(fondo, TEXTO_OSCURO) ? TEXTO_CLARO : TEXTO_OSCURO;
}

interface ClaseImagen {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  materia_id?: string | null;
  titulo?: string | null;
}

/** Clave que agrupa las clases de una misma materia. */
export const claveMateria = (c: Pick<ClaseImagen, 'materia_id' | 'titulo'>) => c.materia_id ?? `t:${(c.titulo ?? '').trim().toLowerCase()}`;

const orden = (a: ClaseImagen, b: ClaseImagen) =>
  a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio) || a.hora_fin.localeCompare(b.hora_fin);

/**
 * Un color distinto por materia, en el orden en que aparecen en la semana
 * (así dos materias no comparten color mientras alcancen los tonos).
 */
export function coloresPorMateria(clases: ClaseImagen[], paleta: PaletaImagen): Map<string, string> {
  const res = new Map<string, string>();
  for (const c of [...clases].sort(orden)) {
    const k = claveMateria(c);
    if (!res.has(k)) res.set(k, paleta.tonos[res.size % paleta.tonos.length]);
  }
  return res;
}

/** Materias para la leyenda, sin repetir, en el orden de la semana. */
export function materiasDeLeyenda<T extends ClaseImagen>(clases: T[], nombre: (c: T) => string): { clave: string; nombre: string }[] {
  const vistas = new Set<string>();
  const res: { clave: string; nombre: string }[] = [];
  for (const c of [...clases].sort(orden)) {
    const k = claveMateria(c);
    if (vistas.has(k)) continue;
    vistas.add(k);
    res.push({ clave: k, nombre: nombre(c) });
  }
  return res;
}

/** Lunes a viernes siempre; sábado y domingo solo si hay clases. */
export function diasDeImagen(clases: Pick<ClaseImagen, 'dia_semana'>[]): number[] {
  const dias = [1, 2, 3, 4, 5];
  if (clases.some((c) => c.dia_semana === 6)) dias.push(6);
  if (clases.some((c) => c.dia_semana === 7)) dias.push(7);
  return dias;
}

/** Título y subtítulo: sin espacios de más; vacío vuelve al predeterminado. */
export function textoImagen(valor: string | null | undefined, predeterminado: string, largo = 40): string {
  const t = (valor ?? '').replace(/\s+/g, ' ').trim().slice(0, largo).trim();
  return t || predeterminado;
}

/** Preferencias guardadas en el celular (título, subtítulo, modo y paleta). */
export interface PreferenciasImagen {
  titulo: string | null;
  subtitulo: string | null;
  modo: ModoImagen | null;
  paleta: string;
}

export function leerPreferenciasImagen(texto: string | null): PreferenciasImagen {
  const base: PreferenciasImagen = { titulo: null, subtitulo: null, modo: null, paleta: PALETA_PREDETERMINADA };
  if (!texto) return base;
  try {
    const v = JSON.parse(texto) as Partial<Record<keyof PreferenciasImagen, unknown>>;
    return {
      titulo: typeof v.titulo === 'string' ? v.titulo : null,
      subtitulo: typeof v.subtitulo === 'string' ? v.subtitulo : null,
      modo: v.modo === 'claro' || v.modo === 'oscuro' ? v.modo : null,
      paleta: paletaPorId(typeof v.paleta === 'string' ? v.paleta : null).id,
    };
  } catch {
    return base;
  }
}
