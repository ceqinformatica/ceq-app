/**
 * Lee el horario (o anteproyecto) de exámenes finales que publica la
 * Dirección Académica y arma la lista de fechas por materia y llamado.
 *
 * No depende de un formato fijo. Reconoce:
 * - tablas con una columna por llamado ("1er. llamado | 2do. llamado ...");
 * - secciones ("PRIMER LLAMADO" y debajo las materias con su fecha);
 * - fechas 07/12/2026, 7-12-26, 07/12 o "7 de diciembre"; horas 08:00,
 *   8.00 hs, 8 hs, 14h30;
 * - nombres de materia con o sin tildes, en mayúsculas o abreviados
 *   ("Qca. Orgánica II"), comparándolos con las materias de la carrera;
 * - una materia cuyo nombre ocupa dos renglones de la tabla.
 *
 * Lo que no reconoce lo devuelve igual (sin materia) para que el admin lo
 * corrija antes de publicar.
 */

export interface FilaFinal {
  /** Nombre de la materia como está en la malla, o null si no se reconoció. */
  materia: string | null;
  llamado: number;
  /** AAAA-MM-DD */
  fecha: string;
  /** HH:MM o null */
  hora: string | null;
  aula: string | null;
  /** Renglón del PDF de donde salió (para revisar). */
  origen: string;
}

export interface LecturaHorario {
  filas: FilaFinal[];
  /** Renglones con fecha que no se pudieron usar. */
  sinUsar: string[];
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Minúsculas, sin tildes, sin signos, con números separados de las letras. */
export function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9/:.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Abreviaturas comunes en las planillas de la facultad. */
const ABREVIATURAS: [RegExp, string][] = [
  [/\bqca\b\.?/g, 'quimica'],
  [/\bquim\b\.?/g, 'quimica'],
  [/\bmat\b\.?/g, 'matematica'],
  [/\bfis\b\.?/g, 'fisica'],
  [/\bbiol\b\.?/g, 'biologia'],
  [/\banal\b\.?/g, 'analisis'],
  [/\bintrod\b\.?/g, 'introduccion'],
  [/\bfund\b\.?/g, 'fundamentos'],
  [/\borg\b\.?/g, 'organica'],
  [/\binorg\b\.?/g, 'inorganica'],
  [/\bgral\b\.?/g, 'general'],
  [/\btec\b\.?/g, 'tecnologia'],
];

const ROMANOS: Record<string, string> = { '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v', '6': 'vi' };

/** Forma para comparar nombres: normalizada, sin abreviaturas ni puntos, números a romanos. */
export function clave(t: string): string {
  let s = normalizar(t).replace(/\./g, ' ');
  for (const [re, por] of ABREVIATURAS) s = s.replace(re, por);
  s = s.replace(/\b([1-6])\b/g, (_, n: string) => ROMANOS[n]);
  return s.replace(/\b(de|del|la|las|el|los|y|e|en|a|al)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface Patron {
  nombre: string;
  clave: string;
  palabras: string[];
}

export function patrones(materias: string[]): Patron[] {
  const vistos = new Map<string, Patron>();
  for (const nombre of materias) {
    const c = clave(nombre);
    if (c.length < 3 || vistos.has(c)) continue;
    vistos.set(c, { nombre, clave: c, palabras: c.split(' ') });
  }
  // Primero las más largas: "Química Orgánica II" antes que "Química Orgánica".
  return [...vistos.values()].sort((a, b) => b.clave.length - a.clave.length);
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Materias que aparecen en el texto (ya en forma clave), con su posición. */
export function materiasEn(texto: string, lista: Patron[]): { patron: Patron; desde: number; hasta: number }[] {
  const encontradas: { patron: Patron; desde: number; hasta: number }[] = [];
  const ocupado: [number, number][] = [];
  for (const p of lista) {
    const re = new RegExp(`(?:^| )${escapar(p.clave)}(?= |$)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      const desde = m.index + (m[0].startsWith(' ') ? 1 : 0);
      const hasta = desde + p.clave.length;
      if (!ocupado.some(([a, b]) => desde < b && hasta > a)) {
        encontradas.push({ patron: p, desde, hasta });
        ocupado.push([desde, hasta]);
      }
    }
  }
  return encontradas.sort((a, b) => a.desde - b.desde);
}

/** La materia más parecida al texto, si se parece bastante (para nombres cortados o con errores). */
/** Distancia de edición, cortando en cuanto pasa del máximo. */
function distancia(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      menor = Math.min(menor, fila[j]);
    }
    if (menor > max) return max + 1;
    previa = fila;
  }
  return previa[b.length];
}

/**
 * La palabra está en el texto, igual o con un error de lectura (OCR):
 * una letra distinta en palabras de 5 o más letras, dos en las de 9 o más.
 */
function tienePalabra(palabras: Set<string>, w: string): boolean {
  if (palabras.has(w)) return true;
  // Palabra cortada por el borde de la celda o abreviada: "Gene" por "General".
  for (const p of palabras) if (p.length >= 4 && w.length > p.length && w.startsWith(p)) return true;
  const max = w.length >= 9 ? 2 : w.length >= 5 ? 1 : 0;
  if (!max) return false;
  for (const p of palabras) if (p.length >= 4 && distancia(p, w, max) <= max) return true;
  return false;
}

export function parecida(texto: string, lista: Patron[]): Patron | null {
  const palabras = new Set(texto.split(' ').filter((w) => w.length > 1 && !/^\d/.test(w)));
  if (!palabras.size) return null;
  let mejor: Patron | null = null;
  let puntaje = 0;
  for (const p of lista) {
    const comunes = p.palabras.filter((w) => tienePalabra(palabras, w)).length;
    // Todas las palabras de la materia tienen que estar (salvo una, si son 4 o más).
    const faltan = p.palabras.length - comunes;
    if (faltan > (p.palabras.length >= 4 ? 1 : 0)) continue;
    // El número (I, II...) tiene que coincidir si la materia lo tiene.
    const romano = p.palabras.find((w) => /^(i|ii|iii|iv|v|vi)$/.test(w));
    if (romano && !palabras.has(romano)) continue;
    const s = comunes / Math.max(p.palabras.length, palabras.size);
    if (s > puntaje) {
      puntaje = s;
      mejor = p;
    }
  }
  return puntaje >= 0.5 ? mejor : null;
}

export interface FechaEncontrada {
  fecha: string;
  pos: number;
}

/** Año de una fecha sin año: la más cercana a la referencia (hacia adelante, con 2 meses de margen). */
function anioPara(mes: number, dia: number, ref: Date): number {
  const base = ref.getFullYear();
  const candidatos = [base - 1, base, base + 1].map((a) => new Date(a, mes - 1, dia));
  const desde = new Date(ref);
  desde.setMonth(desde.getMonth() - 2);
  return (candidatos.find((c) => c >= desde) ?? candidatos[1]).getFullYear();
}

export function valida(a: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const f = new Date(a, m - 1, d);
  return f.getMonth() === m - 1 && f.getDate() === d;
}

const dos = (n: number) => String(n).padStart(2, '0');

export function fechasEn(texto: string, ref: Date): FechaEncontrada[] {
  const out: FechaEncontrada[] = [];
  const numericas = /(?:^|[^\d:])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?![\d:])/g;
  for (const m of texto.matchAll(numericas)) {
    const d = Number(m[1]);
    const mes = Number(m[2]);
    let a = m[3] ? Number(m[3]) : anioPara(mes, d, ref);
    if (a < 100) a += 2000;
    if (valida(a, mes, d)) out.push({ fecha: `${a}-${dos(mes)}-${dos(d)}`, pos: (m.index ?? 0) + m[0].indexOf(m[1]) });
  }
  // "7 de diciembre (de 2026)"
  const largas = /\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?/g;
  for (const m of texto.matchAll(largas)) {
    const d = Number(m[1]);
    const mes = MESES[m[2]];
    const a = m[3] ? Number(m[3]) : anioPara(mes, d, ref);
    if (valida(a, mes, d)) out.push({ fecha: `${a}-${dos(mes)}-${dos(d)}`, pos: m.index ?? 0 });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

export function horasEn(texto: string): { hora: string; pos: number }[] {
  const out: { hora: string; pos: number }[] = [];
  const re = /(?:^|[^\d/.:-])([01]?\d|2[0-3])(?:\s*[:.h]\s*([0-5]\d))?(\s*(?:hs?|hrs?|horas)\b\.?)?(?![\d/])/g;
  for (const m of texto.matchAll(re)) {
    // Sin minutos hace falta "hs" ("14 hs"); con ":" o "h" alcanza.
    if (!m[2] && !m[3]) continue;
    const h = Number(m[1]);
    if (h < 6 || h > 22) continue;
    out.push({ hora: `${dos(h)}:${m[2] ?? '00'}`, pos: (m.index ?? 0) + m[0].indexOf(m[1]) });
  }
  return out;
}

/** Número de llamado que nombra el texto: "1er llamado", "primer llamado", "llamado 2"... */
function llamadosEn(texto: string): { n: number; pos: number }[] {
  const out: { n: number; pos: number }[] = [];
  const ordinales: Record<string, number> = { primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4, quinto: 5 };
  const re = /\b(?:(\d)\s*(?:er|ero|do|ro|to|o|°|º)?\.?\s*(?:llamado|llam\.?)|(primer|primero|segundo|tercer|tercero|cuarto|quinto)\s+llamado|llamado\s*(?:n\s*)?(\d))\b/g;
  for (const m of texto.matchAll(re)) {
    const n = m[1] ? Number(m[1]) : m[2] ? ordinales[m[2]] : Number(m[3]);
    if (n >= 1 && n <= 5) out.push({ n, pos: m.index ?? 0 });
  }
  return out;
}

export function aulaEn(texto: string): string | null {
  const m = /(?:\b|h)(aula|sala|lab(?:oratorio)?|anfiteatro|auditorio)\.?\s*(?:n\s*)?([a-z0-9-]{1,6})\b/.exec(texto);
  if (!m) return null;
  const tipo = m[1].startsWith('lab') ? 'Lab.' : m[1][0].toUpperCase() + m[1].slice(1);
  return `${tipo} ${m[2].toUpperCase()}`;
}

/**
 * Lee el texto del PDF y devuelve las fechas por materia.
 * `materias`: nombres de las materias de la carrera (de todos sus planes).
 * `referencia`: cuándo se sube (para completar el año de fechas sin año).
 */
export function leerHorarioFinales(texto: string, materias: string[], referencia = new Date()): LecturaHorario {
  const lista = patrones(materias);
  const filas: FilaFinal[] = [];
  const sinUsar: string[] = [];
  let columnas = 0; // tabla con una columna por llamado
  let seccion = 1; // llamado de la sección actual
  let pendiente: Patron | null = null; // materia de un renglón sin fecha (nombre en dos renglones)
  let previo = ''; // texto del renglón anterior sin fechas
  let horaGeneral: string | null = null; // "Hora: 08:00" del encabezado

  const agregar = (p: Patron | null, fechas: FechaEncontrada[], horas: { hora: string; pos: number }[], aula: string | null, origen: string) => {
    fechas.forEach((f, i) => {
      // Hora: la que está después de esta fecha (y antes de la siguiente), o la única del renglón.
      const siguiente = fechas[i + 1]?.pos ?? Infinity;
      const propia = horas.find((h) => h.pos > f.pos && h.pos < siguiente);
      const unica = horas.length === 1 || new Set(horas.map((h) => h.hora)).size === 1 ? horas[0]?.hora : undefined;
      const hora = propia?.hora ?? unica ?? horaGeneral;
      const llamado = fechas.length > 1 ? Math.min(i + 1, 5) : seccion;
      filas.push({ materia: p?.nombre ?? null, llamado, fecha: f.fecha, hora, aula, origen });
    });
  };

  for (const renglon of texto.split('\n')) {
    const crudo = renglon.trim();
    if (!crudo) continue;
    const n = normalizar(crudo);
    const llamados = llamadosEn(n);
    const fechas = fechasEn(n, referencia);
    if (llamados.length >= 2) {
      columnas = llamados.length;
      pendiente = null;
      previo = '';
      continue;
    }
    if (llamados.length === 1 && !fechas.length) {
      seccion = llamados[0].n;
      columnas = 0;
      pendiente = null;
      previo = '';
      continue;
    }
    const k = clave(crudo);
    const encontradas = materiasEn(k, lista);
    const horas = horasEn(n);
    const aula = aulaEn(n);
    if (!fechas.length && /\bhora\b/.test(n) && horas.length === 1) {
      // "Hora: 08:00 hs" en el encabezado: vale para las fechas que no traen hora.
      horaGeneral = horas[0].hora;
      continue;
    }
    if (!fechas.length) {
      // Renglón sin fechas: puede ser la primera mitad del nombre de una materia.
      pendiente = encontradas[encontradas.length - 1]?.patron ?? parecida(k, lista);
      previo = k;
      continue;
    }
    if (encontradas.length > 1) {
      // Dos materias en el mismo renglón: cada una con las fechas que le siguen.
      // Las posiciones son de la versión "clave"; se reparten en orden.
      const porMateria = Math.max(1, Math.floor(fechas.length / encontradas.length));
      encontradas.forEach((e, i) => agregar(e.patron, fechas.slice(i * porMateria, (i + 1) * porMateria), horas, aula, crudo));
      pendiente = null;
      previo = '';
      continue;
    }
    const unido = previo ? `${previo} ${k}` : '';
    const p = encontradas[0]?.patron ?? parecida(k, lista) ?? (unido ? materiasEn(unido, lista).pop()?.patron ?? parecida(unido, lista) : null) ?? pendiente;
    previo = '';
    if (!p) sinUsar.push(crudo);
    // Si hay tabla de columnas y el renglón trae más fechas que columnas, se ignoran las de más.
    agregar(p, columnas ? fechas.slice(0, Math.max(columnas, 1)) : fechas, horas, aula, crudo);
    pendiente = null;
  }

  // Sin duplicados (misma materia, llamado y fecha).
  const vistas = new Set<string>();
  const unicas = filas.filter((f) => {
    const k = `${f.materia ?? f.origen}|${f.llamado}|${f.fecha}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  return { filas: unicas, sinUsar };
}

/** Las filas que pertenecen a una materia de la lista (para el estudiante). */
export function mismaMateria(a: string, b: string): boolean {
  return clave(a) === clave(b);
}

export const textoLlamado = (n: number) => `${n}.${n === 1 || n === 3 ? 'er' : 'º'} llamado`;

/**
 * Carrera de la que habla el PDF, mirando el encabezado ("CARRERA:
 * BIOQUÍMICA"). Devuelve el id o null si no se reconoce.
 */
export function detectarCarrera(texto: string, carreras: { id: string; nombre: string; sigla?: string | null }[]): string | null {
  const encabezado = texto.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 15).map(normalizar);
  const nombres = carreras
    .map((c) => ({ id: c.id, n: normalizar(c.nombre).replace(/^(carrera de|licenciatura en|lic en)\s+/, '') }))
    .sort((a, b) => b.n.length - a.n.length);
  const buscar = (linea: string) => nombres.find((c) => new RegExp(`(^| )${escapar(c.n)}( |$)`).test(linea))?.id ?? null;
  for (const l of encabezado) if (/\bcarrera\b/.test(l)) {
    const id = buscar(l);
    if (id) return id;
  }
  for (const l of encabezado) {
    const id = buscar(l);
    if (id) return id;
  }
  return null;
}

/**
 * Plan de estudios que nombra el encabezado: "PLAN 2018", "Plan de estudios
 * 2026", "Proyecto Académico 2018". Devuelve el año o null.
 */
export function detectarPlan(texto: string): number | null {
  const n = normalizar(texto.split('\n').slice(0, 25).join(' '));
  const m = /\b(?:plan(?: de estudios?)?|proyecto academico|malla(?: curricular)?)\s*(?:n\s*)?:?\s*(20[0-4]\d)\b/.exec(n);
  return m ? Number(m[1]) : null;
}

/** "2026-12-07" → "07/12/2026" (para los campos de fecha). */
export const isoATexto = (iso: string) => iso.split('-').reverse().join('/');
/** "07/12/2026" → "2026-12-07", o null. */
export function textoAIso(t: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t.trim());
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return valida(a, mes, d) ? `${a}-${dos(mes)}-${dos(d)}` : null;
}

const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Título para el horario: "Anteproyecto de finales · diciembre 2026". */
export function tituloSugerido(texto: string, ahora = new Date()): string {
  const n = normalizar(texto.slice(0, 1500));
  const m = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d\d)\b/.exec(n);
  const periodo = m ? `${m[1] === 'setiembre' ? 'septiembre' : m[1]} ${m[2]}` : `${NOMBRE_MES[ahora.getMonth()]} ${ahora.getFullYear()}`;
  return `${/anteproyecto/.test(n) ? 'Anteproyecto de finales' : 'Horario de finales'} · ${periodo}`;
}
