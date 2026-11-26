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
  /** Plan de la fila ("IQ2018", "PLAN 2018"), si lo dice. */
  plan?: number | null;
  /** Planes en los que va esta mesa (la misma materia y fecha en 2018 y 2026 queda una sola fila con los dos). */
  planes?: number[];
  /** "SEMESTRE OPUESTO" en la fila: mesa de una materia del otro semestre. */
  opuesto?: boolean;
  /** Renglón del PDF de donde salió (para revisar). */
  origen: string;
}

/** Materia con su plan, su número de orden (el del código "IQ010") y su nivel. */
export interface FichaMateria {
  nombre: string;
  plan: number | null;
  orden: number | null;
  nivel: number | null;
}

export interface OpcionesLectura {
  /** Para reconocer la materia por el código de la planilla. */
  fichas?: FichaMateria[];
  /** Con un plan elegido, solo las filas de ese plan (y las que no lo dicen). */
  plan?: number | null;
  /** Varios planes a la vez (por ejemplo 2018 y 2026): solo sus filas (y las que no lo dicen). Gana sobre `plan`. */
  planes?: number[];
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

/**
 * Posición en el texto normalizado donde empieza la palabra que, en la versión
 * "clave" del mismo texto, está en `desdeClave` (las dos versiones no tienen
 * el mismo largo: la clave quita artículos y expande abreviaturas).
 */
function posicionEnNormalizado(normalizado: string, desdeClave: number): number {
  const palabras = [...normalizado.matchAll(/\S+/g)];
  for (let i = 0; i < palabras.length; i++) {
    const prefijo = palabras.slice(0, i + 1).map((m) => m[0]).join(' ');
    if (clave(prefijo).length > desdeClave) return palabras[i].index ?? 0;
  }
  return normalizado.length;
}

/** La materia más parecida al texto, si se parece bastante (para nombres cortados o con errores). */
/** Distancia de edición, cortando en cuanto pasa del máximo. */
export function distancia(a: string, b: string, max: number): number {
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

/** Números romanos que el OCR lee con eles o unos: "Cálculo Il", "Seminario (I", "Física lll". */
export function romanosOcr(t: string): string {
  return t
    .replace(/(^|\s)[il1|]{3}(?=$|[\s:,.;)-])/gi, '$1III')
    .replace(/(^|\s)(?:[(]?[il|][il1|]|[il|]1|tl|h)(?=$|[\s:,.;)-])/gi, '$1II');
}

const MESES_CORTOS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

/** "25-nov", "03-dic", "05-feb" (y como los lee el OCR: "O3-dic", "11--dic", "14dic", "27-n0v", "23-no0v"). */
export function fechasCortasEn(texto: string, ref: Date): FechaEncontrada[] {
  const out: FechaEncontrada[] = [];
  const re = /(?:^|[^\d:])([0-3o]?[\do])\s*-{0,2}\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|n[o0]{1,2}v|dic)\b/gi;
  for (const m of texto.matchAll(re)) {
    const d = Number(m[1].replace(/o/gi, '0'));
    const mes = MESES_CORTOS[m[2].toLowerCase().replace(/[o0]+/, 'o').replace(/^no+v$/, 'nov')];
    if (!mes) continue;
    const a = anioPara(mes, d, ref);
    if (valida(a, mes, d)) out.push({ fecha: `${a}-${dos(mes)}-${dos(d)}`, pos: (m.index ?? 0) + m[0].indexOf(m[1]) });
  }
  return out;
}

/** Año al que se refiere la planilla: "SEGUNDO SEMESTRE 2026" → fechas de nov 2026 a mar 2027. */
function referenciaDelDocumento(texto: string): Date | null {
  const n = normalizar(texto.slice(0, 3000));
  const m = /\b(primer|1\s*er|segundo|2\s*do)\s+semestre\s*(?:del?\s*)?(?:ano\s*)?(20\d\d)\b/.exec(n);
  if (!m) return null;
  return /^(primer|1)/.test(m[1]) ? new Date(Number(m[2]), 4, 1) : new Date(Number(m[2]), 9, 1);
}

/**
 * Plan de una fila: "PLAN 2026" o el año pegado a la sigla de la carrera:
 * "IQ2018" (el OCR lo lee "102018"), "IQ2008-10". Un año suelto ("15 de
 * diciembre de 2025", "2025-12-18") no es un plan.
 */
function planDeFila(crudo: string): number | null {
  const m = /\bplan\s*:?\s*(20(?:0[5-9]|[1-3]\d))(?!\d)/i.exec(crudo) ?? /(?:^|\s)[a-z|][a-z0-9|]{0,2}(20(?:0[5-9]|[1-3]\d))(?=\s|-\d{1,2}(?:\s|$)|$)|(?:^|\s)\d[a-z0-9|]?(20(?:0[5-9]|[1-3]\d))(?=\s|-\d{1,2}(?:\s|$)|$)/i.exec(crudo);
  return m ? Number(m[1] ?? m[2]) : null;
}

/** Número del código de la materia al principio de la fila: "IQ010", "IQ-07" (OCR: "10010", "10-07", "1Q009"). */
/** El código de la fila tal como está ("iq-05", "10070"), para comparar filas; nada con forma de fecha. */
function codigoCrudo(crudo: string): string | null {
  const m = /^\W*([a-z0-9|]{1,2}\s?[-.]?\s?[0-9o]{2,3})\b/i.exec(crudo);
  if (!m) return null;
  // "15-12" es una fecha, salvo que la fila traiga el plan por sigla ("1Q2026"): ahí es "IQ-12" mal leído.
  const conSigla = /(?:^|\s)[a-z0-9|]{2}20[0-4]\d(?=[\s-]|$)/i.test(crudo.slice(m[0].length));
  if ((!conSigla && /^\d{1,2}\s?[-/.]\s?\d{1,2}$/.test(m[1].trim())) || /\b\d{1,2}[-/]\d{1,2}[-/]/.test(crudo.slice(0, 12))) return null;
  return m[1].toLowerCase().replace(/[\s.-]/g, '').replace(/o/g, '0').replace(/[|l]/g, '1');
}

function numeroDeCodigo(crudo: string): number | null {
  const m = /^\W*[a-z0-9|]{1,2}\s?[-.]?\s?([0-9o]{2,3})\b/i.exec(crudo);
  if (!m) return null;
  const v = Number(m[1].replace(/o/gi, '0').slice(-2));
  return v >= 1 && v <= 99 ? v : null;
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
export function leerHorarioFinales(texto: string, materias: string[], referencia = new Date(), opciones: OpcionesLectura = {}): LecturaHorario {
  const lista = patrones(materias);
  referencia = referenciaDelDocumento(texto) ?? referencia;
  // Planilla con fechas "25-nov": los "10-07" son códigos de materia, no fechas.
  const cortas = fechasCortasEn(normalizar(texto), referencia).length >= 3;
  const fechasDe = (n: string) => (cortas ? fechasCortasEn(n, referencia) : fechasEn(n, referencia));
  let vioLlamados = false;
  const filas: FilaFinal[] = [];
  const sinUsar: string[] = [];
  let columnas = 0; // tabla con una columna por llamado
  let seccion = 1; // llamado de la sección actual
  let pendiente: Patron | null = null; // materia de un renglón sin fecha (nombre en dos renglones)
  let previo = ''; // texto del renglón anterior sin fechas
  let horaGeneral: string | null = null; // "Hora: 08:00" del encabezado
  const enLista = new Set(lista.map((p) => p.nombre));
  // Filas cuya materia confirmó el código, y filas sin materia reconocida con su código (para completarlas al final).
  const confirmadas = new Map<FilaFinal, string>();
  const dudosas = new Map<FilaFinal, { codigo: string; nombre: string }>();

  const agregar = (p: Patron | null, fechas: FechaEncontrada[], horas: { hora: string; pos: number }[], aula: string | null, origen: string, plan: number | null = null) => {
    fechas.forEach((f, i) => {
      // Hora: la que está después de esta fecha (y antes de la siguiente), o la única del renglón.
      const siguiente = fechas[i + 1]?.pos ?? Infinity;
      const propia = horas.find((h) => h.pos > f.pos && h.pos < siguiente);
      const unica = horas.length === 1 || new Set(horas.map((h) => h.hora)).size === 1 ? horas[0]?.hora : undefined;
      const hora = propia?.hora ?? unica ?? horaGeneral;
      const llamado = fechas.length > 1 ? Math.min(i + 1, 5) : seccion;
      filas.push({ materia: p?.nombre ?? null, llamado, fecha: f.fecha, hora, aula, plan, planes: plan != null ? [plan] : [], opuesto: /\bopuest/.test(normalizar(origen)), origen });
    });
  };

  for (const renglon of texto.split('\n')) {
    const crudo = renglon.trim();
    if (!crudo) continue;
    const n = normalizar(crudo);
    const llamados = llamadosEn(n);
    const fechas = fechasDe(n);
    if (llamados.length) vioLlamados = true;
    if (llamados.length >= 2) {
      columnas = llamados.length;
      pendiente = null;
      previo = '';
      continue;
    }
    if (llamados.length === 1 && !fechas.length) {
      seccion = llamados[0].n;
      columnas = 0;
      horaGeneral = null;
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
      // Dos materias en el mismo renglón: cada una se queda con las fechas que
      // están entre su nombre y el de la siguiente. Las fechas antes de la
      // primera materia no se pueden asociar: quedan sin materia, para revisar.
      const inicios = encontradas.map((e) => posicionEnNormalizado(n, e.desde));
      const sueltas = fechas.filter((f) => f.pos < inicios[0]);
      if (sueltas.length) {
        agregar(null, sueltas, horas, aula, crudo);
        sinUsar.push(crudo);
      }
      let sinFecha = false;
      encontradas.forEach((e, i) => {
        const hasta = inicios[i + 1] ?? Infinity;
        const propias = fechas.filter((f) => f.pos >= inicios[i] && f.pos < hasta);
        if (!propias.length) sinFecha = true;
        agregar(e.patron, propias, horas, aula, crudo);
      });
      // Una materia del renglón sin fecha propia (¿fecha compartida?): que el admin lo revise.
      if (sinFecha && !sueltas.length) sinUsar.push(crudo);
      pendiente = null;
      previo = '';
      continue;
    }
    const unido = previo ? `${previo} ${k}` : '';
    const kr = clave(romanosOcr(crudo));
    const plan = planDeFila(crudo);
    // Planilla con código y plan por fila: primero se busca solo en el nombre (los docentes de la misma fila confunden).
    const soloNombre = plan != null ? nombreEntreCodigoYPlan(crudo) : null;
    const kn = soloNombre ? clave(romanosOcr(soloNombre)) : '';
    // Primero lo exacto (en el nombre y en la fila), después lo parecido.
    const exacta = (kn ? materiasEn(kn, lista)[0]?.patron : null) ?? materiasEn(kr, lista)[0]?.patron ?? encontradas[0]?.patron ?? null;
    let p = exacta ?? (kn ? parecida(kn, lista) : null) ?? parecida(kr, lista) ?? (unido ? materiasEn(unido, lista).pop()?.patron ?? parecida(unido, lista) : null) ?? pendiente;
    // El código de la planilla (IQ010 = materia 10 del plan) desempata "Cálculo" / "Cálculo 1" / "Cálculo Il".
    // Si el nombre no se reconoció, también rescata uno mal leído ("fremmodinámica" = Termodinámica I).
    const porCodigo = codigoAMateria(crudo, plan, opciones.fichas, lista, kn || kr, !p);
    if (porCodigo) p = porCodigo;
    previo = '';
    if (!p) {
      sinUsar.push(crudo);
      // Planilla con código y plan por fila: el nombre es lo que está entre los dos ("10070 Inglés Técnico I 102018").
      const leido = plan != null ? nombreEntreCodigoYPlan(crudo) : null;
      if (leido) p = { nombre: leido, clave: clave(leido), palabras: clave(leido).split(' ') };
    }
    // Si hay tabla de columnas y el renglón trae más fechas que columnas, se ignoran las de más.
    const antes = filas.length;
    agregar(p, columnas ? fechas.slice(0, Math.max(columnas, 1)) : fechas, horas, aula, crudo, plan);
    const codigo = plan != null ? codigoCrudo(crudo) : null;
    if (codigo) {
      for (const f of filas.slice(antes)) {
        if (f.materia && ((porCodigo && f.materia === porCodigo.nombre) || (exacta && f.materia === exacta.nombre))) confirmadas.set(f, `${plan}|${codigo}`);
        else if (!p || p === pendiente || !enLista.has(p.nombre)) dudosas.set(f, { codigo: `${plan}|${codigo}`, nombre: kn });
      }
    }
    pendiente = null;
  }

  // Mismo código y plan = misma materia: si en un llamado se confirmó la materia, por código o por nombre exacto ("Inglés Técnico 1")
  // y en otro no se reconoció ("Inglés Técnico", sin el número), se completa, pero solo si lo leído
  // es el comienzo del nombre de esa materia.
  const porCodigoLeido = new Map<string, Set<string>>();
  for (const [f, k] of confirmadas) if (f.materia) porCodigoLeido.set(k, new Set([...(porCodigoLeido.get(k) ?? []), f.materia]));
  for (const [f, d] of dudosas) {
    const c = porCodigoLeido.get(d.codigo);
    if (c?.size !== 1 || !d.nombre) continue;
    const materia = [...c][0];
    const w = clave(materia).split(' ');
    const leido = d.nombre.split(' ').filter(Boolean);
    if (leido.length && leido.every((x, i) => w[i] === x)) f.materia = materia;
  }

  // Un plan que aparece en una sola fila es una mala lectura ("102015" por "IQ2018"): esa fila queda sin plan.
  const conocidos = new Set<number>([
    ...planesDelTexto(texto),
    ...(opciones.fichas ?? []).flatMap((f) => (f.plan != null ? [f.plan] : [])),
    ...(opciones.planes ?? []),
    ...(opciones.plan != null ? [opciones.plan] : []),
    ...(detectarPlan(texto) != null ? [detectarPlan(texto) as number] : []),
  ]);
  for (const f of filas) {
    if (f.plan != null && !conocidos.has(f.plan)) {
      f.plan = null;
      f.planes = [];
    }
  }
  const quiero = opciones.planes?.length ? opciones.planes : opciones.plan != null ? [opciones.plan] : null;
  let elegidas = quiero == null ? filas : filas.filter((f) => f.plan == null || quiero.includes(f.plan));
  // Sin "1er llamado" en el documento (una fila por mesa): el llamado sale del orden de las fechas de cada materia.
  if (!vioLlamados && !columnas) elegidas = numerarLlamados(elegidas);
  // Sin duplicados (misma materia, llamado y fecha): si viene de dos planes, queda una fila con los dos.
  const vistas = new Map<string, FilaFinal>();
  const unicas = elegidas.filter((f) => {
    const k = `${f.materia ?? f.origen}|${f.llamado}|${f.fecha}`;
    const previa = vistas.get(k);
    if (previa) {
      previa.planes = [...new Set([...(previa.planes ?? []), ...(f.planes ?? [])])].sort((a, b) => a - b);
      previa.opuesto = Boolean(previa.opuesto || f.opuesto);
      previa.hora = previa.hora ?? f.hora;
      previa.aula = previa.aula ?? f.aula;
      return false;
    }
    vistas.set(k, f);
    return true;
  });
  return { filas: unicas, sinUsar };
}

function nombreEntreCodigoYPlan(crudo: string): string | null {
  crudo = crudo.slice(0, 400).replace(/\s{3,}/g, '   ');
  const m = /^\W*[a-z0-9|]{1,5}[-.]?\d{0,3}\.?\s+(.+?)\s{2,}(?:[-|]\s+)*[a-z0-9|]{0,3}\s?20\d\d/i.exec(crudo);
  if (!m) return null;
  // "Optativa 1: Inglés Técnico I" / "Optativa E Inglés Técnico": el nombre es lo de después.
  const t = romanosOcr(
    m[1]
      .replace(/^optativa\s*\S{0,2}\s*:?\s*/i, '')
      .replace(/[\s\-–]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s1$/, ' I')
      .trim(),
  );
  return (t.match(/\p{L}/gu) ?? []).length >= 4 ? t : null;
}

/**
 * Llamado de cada fecha, por materia: las fechas se agrupan en tandas (las
 * de un mismo llamado caen en la misma semana aunque el plan 2018 y el 2026
 * rindan en días distintos) y cada tanda es un llamado. Así una fila que el
 * OCR perdió no corre la numeración de las demás.
 */
function numerarLlamados(filas: FilaFinal[]): FilaFinal[] {
  const porMateria = new Map<string, Set<string>>();
  for (const f of filas) {
    if (!f.materia) continue;
    const m = clave(f.materia);
    if (!porMateria.has(m)) porMateria.set(m, new Set());
    porMateria.get(m)!.add(f.fecha);
  }
  const llamadoDe = new Map<string, number>();
  for (const [m, fechas] of porMateria) {
    let n = 0;
    let inicio = -Infinity;
    for (const fecha of [...fechas].sort()) {
      const t = Date.parse(`${fecha}T12:00:00Z`);
      if (t - inicio > 6 * 86400000) {
        n++;
        inicio = t;
      }
      llamadoDe.set(`${m}|${fecha}`, Math.min(n, 5));
    }
  }
  return filas.map((f) => (f.materia ? { ...f, llamado: llamadoDe.get(`${clave(f.materia)}|${f.fecha}`) ?? f.llamado } : f));
}

/** Materia que nombra el código de la fila, si su nombre se parece a lo que leyó el OCR. */
function codigoAMateria(crudo: string, plan: number | null, fichas: FichaMateria[] | undefined, lista: Patron[], leido: string, aproximado = false): Patron | null {
  if (!fichas?.length || plan == null) return null;
  const num = numeroDeCodigo(crudo);
  if (num == null) return null;
  const ficha = fichas.find((f) => f.plan === plan && f.orden === num);
  if (!ficha) return null;
  // Confirmación: la primera palabra del nombre tiene que estar en la fila ("calculo" en "10010 Cálculo Il").
  const primera = clave(ficha.nombre).split(' ').find((w) => w.length >= 4);
  if (!primera) return null;
  // Solo si el nombre no se reconoció: alcanza con que se parezca ("fremmodinámica" por "Termodinámica"),
  // con largo casi igual ("bioquímica" no confirma "química").
  const tolera = !aproximado ? 0 : primera.length >= 10 ? 3 : primera.length >= 7 ? 2 : primera.length >= 5 ? 1 : 0;
  const palabras = leido.split(' ').slice(0, 6);
  if (!palabras.some((w) => w === primera || (tolera && Math.abs(w.length - primera.length) <= 1 && distancia(w, primera, tolera) <= tolera))) return null;
  return lista.find((p) => p.nombre === ficha.nombre) ?? { nombre: ficha.nombre, clave: clave(ficha.nombre), palabras: clave(ficha.nombre).split(' ') };
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
  // Planilla con filas de varios planes ("PLAN 2018" y "PLAN 2026"): no hay un plan único.
  const todos = new Set([...normalizar(texto).matchAll(/\bplan\s*(20[0-4]\d)\b/g)].map((m) => m[1]));
  if (todos.size > 1) return null;
  const n = normalizar(texto.split('\n').slice(0, 25).join(' '));
  const m = /\b(?:plan(?: de estudios?)?|proyecto academico|malla(?: curricular)?)\s*(?:n\s*)?:?\s*(20[0-4]\d)\b/.exec(n);
  return m ? Number(m[1]) : null;
}

/**
 * Planes que nombran las filas del PDF ("IQ2018", "PLAN 2026"), de menor a
 * mayor. Un año en una sola fila es una mala lectura ("102015" por "IQ2018").
 */
export function planesDelTexto(texto: string): number[] {
  const veces = new Map<number, number>();
  for (const l of texto.split('\n')) {
    const p = planDeFila(l);
    if (p != null) veces.set(p, (veces.get(p) ?? 0) + 1);
  }
  return [...veces].filter(([, n]) => n >= 2).map(([p]) => p).sort((a, b) => a - b);
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
