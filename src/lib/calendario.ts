/**
 * Calendario académico oficial de la FCQ: categorías, qué está pasando
 * ahora y qué viene. Sin dependencias, para probarlo con node --test.
 * Las fechas son días (AAAA-MM-DD) en hora de Paraguay.
 */

export const CATEGORIAS_CALENDARIO = ['clases', 'inscripcion', 'examenes', 'aranceles', 'solicitudes', 'horarios', 'feriado', 'asueto', 'ingresantes'] as const;
export type CategoriaCalendario = (typeof CATEGORIAS_CALENDARIO)[number];

export const NOMBRE_CATEGORIA: Record<CategoriaCalendario, string> = {
  clases: 'Clases',
  inscripcion: 'Inscripciones',
  examenes: 'Finales',
  aranceles: 'Aranceles',
  solicitudes: 'Solicitudes',
  horarios: 'Horario de finales',
  feriado: 'Feriados',
  asueto: 'Asuetos',
  ingresantes: 'Ingresantes',
};

export interface EventoCalendario {
  id: string;
  anio: number;
  semestre: number | null;
  categoria: CategoriaCalendario;
  titulo: string;
  desde: string;
  hasta: string;
  detalle: string | null;
}

export type Momento = 'ahora' | 'proximo' | 'pasado';

/** Hoy en Paraguay como AAAA-MM-DD (el celular puede estar en otra zona). */
export function hoyPy(ahora = new Date()): string {
  // Paraguay usa UTC-3 todo el año desde 2024.
  return new Date(ahora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export function momento(e: Pick<EventoCalendario, 'desde' | 'hasta'>, hoy: string): Momento {
  if (e.hasta < hoy) return 'pasado';
  if (e.desde > hoy) return 'proximo';
  return 'ahora';
}

/** Días enteros entre dos fechas AAAA-MM-DD (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const partes = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return { a, m, d };
};

/** "23 nov", "23 al 27 nov", "28 ene al 11 feb", "28 dic 2026 al 2 ene 2027". */
export function rango(desde: string, hasta: string): string {
  const x = partes(desde);
  const y = partes(hasta);
  if (desde === hasta) return `${x.d} ${MESES_CORTOS[x.m - 1]}`;
  if (x.a !== y.a) return `${x.d} ${MESES_CORTOS[x.m - 1]} ${x.a} al ${y.d} ${MESES_CORTOS[y.m - 1]} ${y.a}`;
  if (x.m === y.m) return `${x.d} al ${y.d} ${MESES_CORTOS[y.m - 1]}`;
  return `${x.d} ${MESES_CORTOS[x.m - 1]} al ${y.d} ${MESES_CORTOS[y.m - 1]}`;
}

/** "Hoy", "Mañana", "En 5 días", "Hasta el 3 dic", "Termina hoy". */
export function cuando(e: Pick<EventoCalendario, 'desde' | 'hasta'>, hoy: string): string {
  const m = momento(e, hoy);
  if (m === 'pasado') return 'Terminó';
  if (m === 'ahora') {
    if (e.desde === e.hasta) return 'Hoy';
    const faltan = diasEntre(hoy, e.hasta);
    if (faltan === 0) return 'Termina hoy';
    if (faltan === 1) return 'Termina mañana';
    const { d, m: mes } = partes(e.hasta);
    return `Hasta el ${d} ${MESES_CORTOS[mes - 1]}`;
  }
  const dias = diasEntre(hoy, e.desde);
  if (dias === 1) return 'Mañana';
  if (dias < 30) return `En ${dias} días`;
  const { d, m: mes } = partes(e.desde);
  return `El ${d} ${MESES_CORTOS[mes - 1]}`;
}

const orden = (a: EventoCalendario, b: EventoCalendario) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta) || a.titulo.localeCompare(b.titulo);

/**
 * Lo que importa ahora: lo que está en curso y lo próximo, sin feriados
 * largos de relleno. Para la tarjeta de Inicio.
 */
export function destacados(eventos: EventoCalendario[], hoy: string, max = 3): EventoCalendario[] {
  const utiles = eventos.filter((e) => momento(e, hoy) !== 'pasado' && e.categoria !== 'clases');
  // Primero lo que está en curso (lo que cierra antes arriba), después lo próximo.
  const enCurso = utiles.filter((e) => momento(e, hoy) === 'ahora').sort((a, b) => a.hasta.localeCompare(b.hasta) || orden(a, b));
  const proximos = utiles.filter((e) => momento(e, hoy) === 'proximo').sort(orden);
  return [...enCurso, ...proximos].slice(0, max);
}

export interface MesCalendario {
  clave: string;
  titulo: string;
  eventos: EventoCalendario[];
}

/** Agrupa por el mes en que empieza cada actividad, en orden. */
export function porMes(eventos: EventoCalendario[]): MesCalendario[] {
  const grupos = new Map<string, EventoCalendario[]>();
  for (const e of [...eventos].sort(orden)) {
    const k = e.desde.slice(0, 7);
    grupos.set(k, [...(grupos.get(k) ?? []), e]);
  }
  return [...grupos.entries()].map(([k, ev]) => {
    const { a, m } = partes(`${k}-01`);
    return { clave: k, titulo: `${MESES[m - 1].charAt(0).toUpperCase()}${MESES[m - 1].slice(1)} ${a}`, eventos: ev };
  });
}

/** Filtra por categoría y, si no se piden, saca lo que ya pasó. */
export function filtrar(eventos: EventoCalendario[], hoy: string, categoria: CategoriaCalendario | null, verPasadas: boolean): EventoCalendario[] {
  return eventos.filter((e) => (categoria == null || e.categoria === categoria) && (verPasadas || momento(e, hoy) !== 'pasado'));
}

/** Revisa una fila antes de guardarla. Devuelve el problema o null. */
export function problemaEvento(e: { titulo: string; desde: string; hasta: string }): string | null {
  if (e.titulo.trim().length < 3) return 'Escribí qué es (al menos 3 letras).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.desde)) return 'Elegí la fecha de inicio.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.hasta)) return 'Elegí la fecha de fin.';
  if (e.hasta < e.desde) return 'La fecha de fin no puede ser antes del inicio.';
  return null;
}
