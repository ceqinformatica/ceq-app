/**
 * Lee el horario de clases que publica la FCQ (un PDF por carrera, casi
 * siempre escaneado) y arma la lista de clases: materia, día, hora, aula y
 * tipo (teoría, RP o laboratorio), con el nivel y la sección de cada tabla.
 *
 * Reconoce dos formas:
 * - grilla: una fila de encabezado con los días (LUNES … SÁBADO) y debajo
 *   una fila por horario ("07:00 - 08:30") con una celda por día; las celdas
 *   vacías se reconocen por la posición, por eso trabaja con FilaDoc (celdas
 *   con su x) y no con texto plano;
 * - lista: cada renglón trae la materia, el día y el horario
 *   ("Química General   Lunes y Miércoles   07:00 a 09:00   Aula 12");
 * - grilla por materia (la de la FCQ): una hoja por carrera, plan y nivel;
 *   una fila por materia con dos renglones, "De:" (hora de inicio) y "A:"
 *   (hora de fin), y por cada día dos columnas, teoría y práctica. Las
 *   marcas "(RP)" y "(L)" dicen si es resolución de problemas o laboratorio.
 *
 * Lo que no reconoce lo devuelve igual (sin materia) para que el admin lo
 * corrija. Sin dependencias, para probarlo con node --test.
 */
import { unirZonas, type Celda, type FilaDoc, type Zona } from './ocr/documento.ts';
import { aulaEn, clave, materiasEn, normalizar, parecida, patrones, romanosOcr, type FichaMateria, type Patron } from './horario-finales.ts';
import type { TipoClase } from './tipo-clase.ts';

export interface ClaseLeida {
  /** Nombre como está en la malla, o null si no se reconoció. */
  materia: string | null;
  /** 1 = lunes … 7 = domingo */
  dia: number;
  /** HH:MM */
  inicio: string;
  fin: string;
  aula: string | null;
  tipo: TipoClase | null;
  nivel: number | null;
  seccion: string | null;
  /** Plan que nombra la hoja ("Plan 2018"), si lo dice. */
  plan?: number | null;
  /** Texto de la celda o renglón del PDF (para revisar). */
  origen: string;
  /** Dónde está en el PDF escaneado (para mostrar el recorte). */
  zona?: Zona | null;
  /** Hoja del PDF (empieza en 0), en la grilla por materia. */
  pagina?: number;
}

/** Algo del PDF que no se pudo convertir en una clase completa, con el motivo. */
export interface ParaRevisar {
  motivo: 'sin-fin' | 'materia' | 'nivel';
  /** Lo que se leyó, para mostrar ("Ingeniería Ambiental: Martes 16:00"). */
  texto: string;
  materia?: string | null;
  dia?: number;
  inicio?: string;
  plan?: number | null;
  /** Hoja del PDF (empieza en 0), si se sabe. */
  pagina?: number;
  zona: Zona | null;
}

export interface LecturaClases {
  clases: ClaseLeida[];
  /** Textos que no se usaron (versión corta de `revisar`). */
  sinUsar: string[];
  revisar: ParaRevisar[];
}

const DIAS: [RegExp, number][] = [
  [/^lunes$/, 1],
  [/^martes$/, 2],
  [/^mi[eé]rcoles$|^miercoles$/, 3],
  [/^jueves$/, 4],
  [/^viernes$/, 5],
  [/^s[aá]bados?$|^sabados?$/, 6],
  [/^domingos?$/, 7],
];
const ABREV_DIAS: Record<string, number> = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 7 };

/** Día que nombra una palabra (ya normalizada), tolerando un error de OCR en las largas. */
export function diaDe(palabra: string): number | null {
  const w = palabra.replace(/[^a-z]/g, '');
  for (const [re, n] of DIAS) if (re.test(w)) return n;
  if (w.length === 3 && ABREV_DIAS[w]) return ABREV_DIAS[w];
  // "MIERCOLE5", "VIERNE5", "jueve": una letra de diferencia.
  const nombres = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  for (let i = 0; i < nombres.length; i++) {
    const n = nombres[i];
    if (w.length >= 5 && Math.abs(w.length - n.length) <= 1 && casiIgual(w, n)) return i + 1;
  }
  return null;
}

function casiIgual(a: string, b: string): boolean {
  let i = 0;
  let j = 0;
  let err = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++err > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return err + (a.length - i) + (b.length - j) <= 1;
}

const dos = (n: number) => String(n).padStart(2, '0');

/** "07:00 - 08:30", "7.00 a 8.30", "07:00 hs. – 08:30 hs." */
const RANGO = /(?:^|[^\d])([01]?\d|2[0-3])\s*[:.h]\s*([0-5]\d)\s*(?:hs?\.?|hrs?\.?)?\s*(?:-|–|—|a|al|hasta)?\s*([01]?\d|2[0-3])\s*[:.h]\s*([0-5]\d)(?!\d)/;
const HORA = /(?:^|[^\d/])([01]?\d|2[0-3])\s*[:.h]\s*([0-5]\d)(?![\d/])/;

export function rangoEn(texto: string): { inicio: string; fin: string } | null {
  const m = RANGO.exec(texto);
  if (!m) return null;
  const inicio = `${dos(Number(m[1]))}:${m[2]}`;
  const fin = `${dos(Number(m[3]))}:${m[4]}`;
  return fin > inicio ? { inicio, fin } : null;
}

function horaSola(texto: string): string | null {
  const m = HORA.exec(texto);
  return m ? `${dos(Number(m[1]))}:${m[2]}` : null;
}

const ORDINALES: Record<string, number> = {
  primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4, quinto: 5, sexto: 6,
  septimo: 7, setimo: 7, octavo: 8, noveno: 9, decimo: 10,
};
const ROMANO: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

/** Nivel que nombra un renglón de título: "PRIMER NIVEL", "3er. Nivel", "NIVEL IV", "5.º semestre". */
export function nivelEn(texto: string): number | null {
  const n = normalizar(texto);
  // Primero "nivel" o "curso"; "semestre" solo si no es el semestre del año ("segundo semestre 2027").
  return nivelCon(n, 'nivel|curso') ?? nivelCon(n.replace(/\b(?:\S+\s+){1,2}semestre\s*(?:del?\s*)?(?:ano\s*)?20\d\d\b/g, ' '), 'semestre');
}

function nivelCon(n: string, palabra: string): number | null {
  let m = new RegExp(`\\b(primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo)\\s+(?:${palabra})\\b`).exec(n);
  if (m) return ORDINALES[m[1]];
  m = new RegExp(`\\b(\\d{1,2})\\s*\\.?\\s*(?:er|ero|do|ro|to|vo|no|mo|o|°|º)?\\s*\\.?\\s*(?:${palabra})\\b`).exec(n);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 10) return Number(m[1]);
  m = new RegExp(`\\b(?:${palabra})\\s*:?\\s*(\\d{1,2}|i{1,3}|iv|v|vi{0,3}|ix|x)\\b`).exec(n);
  if (m) return ROMANO[m[1]] ?? (Number(m[1]) >= 1 && Number(m[1]) <= 10 ? Number(m[1]) : null);
  return null;
}

export function seccionEn(texto: string): string | null {
  const n = normalizar(texto);
  const m = /\bseccion\s*:?\s*(unica|[a-z]|\d{1,2})\b/.exec(n);
  if (!m) return null;
  return m[1] === 'unica' ? 'Única' : m[1].toUpperCase();
}

/** Tipo de clase que se lee en la celda: (T), Teoría, (RP), (Lab), Laboratorio. */
export function tipoEn(texto: string, aula: string | null): TipoClase | null {
  const n = normalizar(texto);
  if (/\(\s*lab\.?\s*\)|\blaboratorio\b|\bpractica de laboratorio\b|\(\s*l\s*\)/i.test(texto) || /\blaboratorio\b/.test(n)) return 'laboratorio';
  if (/\(\s*r\.?\s*p\.?\s*\)|\bresolucion de problemas\b|\(\s*p\s*\)|\bpractica\b/i.test(texto) || /\bresolucion de problemas\b|\bpractica\b/.test(n)) return 'rp';
  if (/\(\s*t\s*\)|\bteor[ií]a\b|\bteorica\b/i.test(texto) || /\bteoria\b/.test(n)) return 'teoria';
  if (aula && /^lab/i.test(aula)) return 'laboratorio';
  return null;
}

/** Materia de un texto: la que aparece entera o, si no, la más parecida. */
const MARCA_TIPO = /\(\s*(?:t|rp|r\.\s*p\.?|lab\.?|l|p)\s*\)/gi;

function materiaDe(texto: string, lista: Patron[]): string | null {
  const k = clave(texto.replace(MARCA_TIPO, ' '));
  return materiasEn(k, lista)[0]?.patron.nombre ?? parecida(k, lista)?.nombre ?? null;
}

/** Pie de página: firmas y cargos, nunca son parte de la tabla. */
const FIRMAS = /\b(prof|dra?|lic|ing|coordinador[a]?|director[a]?|decano|decana|secretari[oa]|firma|sello)\b/;

interface Columna {
  dia: number;
  x: number;
}

/** Días del encabezado con su posición; null si el renglón no es un encabezado de días. */
function encabezado(f: FilaDoc): Columna[] | null {
  const cols: Columna[] = [];
  for (const c of f.celdas) {
    const palabras = normalizar(c.texto).split(' ');
    const dias = palabras.map(diaDe);
    const cuantos = dias.filter((d) => d != null).length;
    if (!cuantos) continue;
    // Varias palabras en la celda: se reparte su ancho según la posición de cada palabra.
    let pos = 0;
    const total = c.texto.length || 1;
    const partes = c.texto.split(/\s+/);
    partes.forEach((p, i) => {
      const d = dias[i];
      const centro = c.x0 + ((pos + p.length / 2) / total) * (c.x1 - c.x0);
      if (d != null) cols.push({ dia: d, x: centro });
      pos += p.length + 1;
    });
  }
  const distintos = new Set(cols.map((c) => c.dia));
  return distintos.size >= 3 ? cols.sort((a, b) => a.x - b.x) : null;
}

/** Columna del día más cercana al centro de la celda (dentro de media columna). */
function diaDeCelda(c: Celda, cols: Columna[]): number | null {
  const centro = (c.x0 + c.x1) / 2;
  const paso = cols.length > 1 ? (cols[cols.length - 1].x - cols[0].x) / (cols.length - 1) : Infinity;
  let mejor: Columna | null = null;
  let dist = Infinity;
  for (const col of cols) {
    const d = Math.abs(col.x - centro);
    if (d < dist) {
      dist = d;
      mejor = col;
    }
  }
  return mejor && dist <= paso * 0.75 ? mejor.dia : null;
}

/** Renglón que describe la tabla (carrera, plan, nivel, sección), sin horas ni días. */
function esTitulo(f: FilaDoc): boolean {
  const t = f.celdas.map((c) => c.texto).join(' ');
  return !rangoEn(t) && (nivelEn(t) != null || seccionEn(t) != null);
}

export function leerHorarioClases(filas: FilaDoc[], materias: string[], plan: number | null = null, fichas: FichaMateria[] = []): LecturaClases {
  const lista = patrones(materias);
  if (esGrillaPorMateria(filas)) {
    const r = leerGrillaPorMateria(filas, lista, fichas);
    // Con un plan elegido, solo las hojas de ese plan (y las que no lo dicen).
    const delPlan = <T extends { plan?: number | null }>(l: T[]) => (plan == null ? l : l.filter((c) => c.plan == null || c.plan === plan));
    const revisar = delPlan(r.revisar);
    return { clases: unirSeguidas(delPlan(r.clases)), sinUsar: revisar.map((x) => x.texto), revisar };
  }
  const clases: ClaseLeida[] = [];
  const sinUsar: string[] = [];
  let nivel: number | null = null;
  let seccion: string | null = null;
  let cols: Columna[] | null = null;
  // Celdas de la última fila de la grilla, por día (para sumarle renglones partidos).
  let ultimaFila: { inicio: string; fin: string; porDia: Map<number, string> } | null = null;
  // Filas de la grilla con una sola hora ("07:00"): el fin es la hora de la fila siguiente.
  let abierta: { inicio: string; porDia: Map<number, string> } | null = null;

  const volcar = (inicio: string, fin: string, porDia: Map<number, string>) => {
    for (const [dia, texto] of porDia) {
      // Celdas vacías o manchas que el OCR leyó como letras sueltas.
      if ((texto.match(/\p{L}/gu) ?? []).length < 4) continue;
      const aula = aulaEn(normalizar(texto.replace(MARCA_TIPO, ' ')));
      clases.push({ materia: materiaDe(texto, lista), dia, inicio, fin, aula, tipo: tipoEn(texto, aula), nivel, seccion, origen: texto.trim() });
    }
  };
  const cerrarAbierta = (fin: string | null) => {
    if (abierta) {
      const f = fin ?? sumarHora(abierta.inicio);
      if (f > abierta.inicio) volcar(abierta.inicio, f, abierta.porDia);
      abierta = null;
    }
  };

  let previa: FilaDoc | null = null;
  for (const f of filas) {
    const texto = f.celdas.map((c) => c.texto).join('   ');
    const n = normalizar(texto);
    if (!n) continue;
    const anterior = previa;
    previa = f;

    const cab = encabezado(f);
    if (cab) {
      cerrarAbierta(null);
      if (ultimaFila) volcar(ultimaFila.inicio, ultimaFila.fin, ultimaFila.porDia);
      cols = cab;
      ultimaFila = null;
      continue;
    }
    if (esTitulo(f)) {
      cerrarAbierta(null);
      // La última fila de la tabla anterior se guarda antes de cambiar de nivel.
      if (ultimaFila) volcar(ultimaFila.inicio, ultimaFila.fin, ultimaFila.porDia);
      nivel = nivelEn(texto) ?? nivel;
      seccion = seccionEn(texto) ?? (nivelEn(texto) != null ? null : seccion);
      cols = null;
      ultimaFila = null;
      continue;
    }

    // Grilla: la primera celda trae la hora (o el rango).
    if (cols) {
      const primera = f.celdas[0]?.texto ?? '';
      const rango = rangoEn(primera);
      const sola = rango ? null : horaSola(primera);
      if (rango || sola) {
        cerrarAbierta(rango?.inicio ?? sola);
        if (ultimaFila) volcar(ultimaFila.inicio, ultimaFila.fin, ultimaFila.porDia);
        const porDia = new Map<number, string>();
        // La hora puede compartir celda con la primera materia si el hueco es chico.
        const celdas = [...f.celdas];
        const resto = primera.replace(rango ? RANGO : HORA, ' ').replace(/^\s*(?:hs?\.?|hrs?\.?)\s*/i, '').trim();
        celdas[0] = { ...celdas[0], texto: resto };
        for (const c of celdas) {
          if (!c.texto.trim()) continue;
          const dia = diaDeCelda(c, cols);
          if (dia == null) continue;
          porDia.set(dia, [porDia.get(dia), c.texto].filter(Boolean).join(' '));
        }
        if (rango) {
          ultimaFila = { ...rango, porDia };
        } else {
          abierta = { inicio: sola!, porDia };
          ultimaFila = null;
        }
        continue;
      }
      // Renglón sin hora pegado debajo de una fila: el resto de las celdas de dos renglones.
      const pegado = anterior?.y == null || f.y == null || anterior.pagina !== f.pagina || f.y - anterior.y < (f.alto ?? 20) * 2.6;
      if ((ultimaFila || abierta) && pegado && !FIRMAS.test(n)) {
        const destino = ultimaFila?.porDia ?? abierta!.porDia;
        for (const c of f.celdas) {
          const dia = diaDeCelda(c, cols);
          if (dia == null) continue;
          destino.set(dia, [destino.get(dia), c.texto].filter(Boolean).join(' '));
        }
        continue;
      }
    }
    if (ultimaFila) {
      volcar(ultimaFila.inicio, ultimaFila.fin, ultimaFila.porDia);
      ultimaFila = null;
    }

    // Lista: materia, días y horario en el mismo renglón.
    const rango = rangoEn(n.replace(/\s+/g, ' '));
    const dias = [...new Set(n.split(/[\s,;/|]+/).map(diaDe).filter((d): d is number => d != null))];
    if (rango && dias.length) {
      const aula = aulaEn(normalizar(texto.replace(MARCA_TIPO, ' ')));
      const materia = materiaDe(texto, lista);
      for (const dia of dias) clases.push({ materia, dia, inicio: rango.inicio, fin: rango.fin, aula, tipo: tipoEn(texto, aula), nivel, seccion, origen: texto.trim() });
      if (!materia) sinUsar.push(texto.trim());
    }
  }
  if (ultimaFila) volcar(ultimaFila.inicio, ultimaFila.fin, ultimaFila.porDia);
  cerrarAbierta(null);

  return { clases: unirSeguidas(clases), sinUsar, revisar: sinUsar.map((texto) => ({ motivo: 'materia' as const, texto, zona: null })) };
}

function sumarHora(h: string): string {
  const [hh, mm] = h.split(':').map(Number);
  return `${dos(Math.min(23, hh + 1))}:${dos(mm)}`;
}

/**
 * Dos bloques seguidos de la misma materia, el mismo día, tipo y aula
 * (07:00–08:30 y 08:30–10:00) son una sola clase de 07:00 a 10:00.
 */
export function unirSeguidas(clases: ClaseLeida[]): ClaseLeida[] {
  const orden = [...clases].sort((a, b) => (a.nivel ?? 0) - (b.nivel ?? 0) || (a.seccion ?? '').localeCompare(b.seccion ?? '') || a.dia - b.dia || a.inicio.localeCompare(b.inicio));
  const salida: ClaseLeida[] = [];
  for (const c of orden) {
    const p = salida[salida.length - 1];
    if (p && c.materia && p.materia === c.materia && p.dia === c.dia && p.nivel === c.nivel && p.seccion === c.seccion && p.tipo === c.tipo && p.aula === c.aula && p.fin === c.inicio) {
      salida[salida.length - 1] = { ...p, fin: c.fin, zona: unirZonas(p.zona, c.zona) };
    } else {
      salida.push(c);
    }
  }
  return salida;
}

export const NOMBRE_DIA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Nivel para mostrar: "1.er nivel". */
export const textoNivel = (n: number) => `${n}.${n === 1 || n === 3 ? 'er' : 'º'} nivel`;

// ───────────────────────── Grilla por materia ─────────────────────────

/** La hoja tiene la fila "TEORIA PRACT. TEORIA PRACT. …" debajo de los días. */
function esGrillaPorMateria(filas: FilaDoc[]): boolean {
  return filas.some((f) => {
    const n = normalizar(f.celdas.map((c) => c.texto).join(' '));
    return (n.match(/\bteoria\b/g) ?? []).length >= 2 && (n.match(/\bpract/g) ?? []).length >= 2;
  });
}

/** Años de plan que nombra un texto ("Plan 2018", "IQ2018", "l2008__"). */
export function planesEn(texto: string): number[] {
  const out = new Set<number>();
  for (const m of texto.matchAll(/(20(?:0[5-9]|[1-3]\d|4[0-5]))(?!\d)/g)) out.add(Number(m[1]));
  return [...out];
}

/** Planes de las hojas de una grilla por materia, con cuántas hojas tiene cada uno (vacío si no es ese formato). */
export function planesDeHojas(filas: FilaDoc[]): Map<number, number> {
  const out = new Map<number, number>();
  if (!esGrillaPorMateria(filas)) return out;
  const vistas = new Set<number>();
  for (const f of filas) {
    if (vistas.has(f.pagina)) continue;
    const plan = encabezadoHoja(f)?.plan;
    if (plan == null) continue;
    vistas.add(f.pagina);
    out.set(plan, (out.get(plan) ?? 0) + 1);
  }
  return out;
}

/** Plan y nivel del encabezado de la hoja: "Carrera: … | Plan | 2018 | Nivel: | 2". */
function encabezadoHoja(f: FilaDoc): { plan: number | null; nivel: number | null } | null {
  const crudo = f.celdas.map((c) => c.texto).join(' ');
  const n = normalizar(crudo);
  // El OCR lee "Nivel" como "Nive!", "Nivet", "Niver"; "Plan" como "Pan".
  const palabraNivel = /\bn[il1]v[ei]?[lrt1i!]?\b/;
  if (!/\bcarrera\b/.test(n) && !(/\bp[l1]?an\b/.test(n) && palabraNivel.test(n))) return null;
  const tramoPlan = /\bp[l1]?an\b(.*?)(?:\bn[il1]v|$)/.exec(n)?.[1] ?? n;
  const plan = planesEn(tramoPlan)[0] ?? null;
  const m = /\bn[il1]v[ei]?[lrt1i!]?\b\W*(?:l\s+)?(\d{1,2})\b/.exec(n);
  const nivel = m && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? Number(m[1]) : null;
  return { plan, nivel };
}

interface Subcolumna {
  dia: number;
  teoria: boolean;
  x: number;
}

/** Hora con su marca ("10:00(RP)", "14:00 (L)") y su posición en la página. */
interface HoraEnCelda {
  hora: string;
  marca: TipoClase | null;
  x: number;
}

const HORA_CELDA = /(\d{1,2})\s*[:.]\s*([0-5]\d)\s*(\(\s*(?:r\.?\s*p\.?|l|1|i|lab\.?)\s*\))?/gi;

function horasDeCelda(c: Celda): HoraEnCelda[] {
  const out: HoraEnCelda[] = [];
  const largo = c.texto.length || 1;
  for (const m of c.texto.matchAll(HORA_CELDA)) {
    let h = Number(m[1]);
    // "40:00": el OCR confunde el 1 con un 4.
    if (h > 23 && m[1].length === 2 && m[1][0] === '4') h = 10 + Number(m[1][1]);
    if (h > 23) continue;
    const marca = m[3] ? (/r/i.test(m[3]) ? 'rp' : 'laboratorio') : null;
    const centro = (m.index ?? 0) + m[0].length / 2;
    out.push({ hora: `${dos(h)}:${m[2]}`, marca, x: c.x0 + (centro / largo) * (c.x1 - c.x0) });
  }
  return out;
}

/** Etiqueta de renglón: "De:", "A:", "¡A". */
const ETIQUETA = /^\W*(de|a)\W*$/i;

function leerGrillaPorMateria(filas: FilaDoc[], lista: Patron[], fichas: FichaMateria[]): { clases: ClaseLeida[]; revisar: ParaRevisar[] } {
  const clases: ClaseLeida[] = [];
  // Hojas sin nivel legible ("Nivel: [ ]"): se deduce de las materias de la hoja.
  const sinNivel: ClaseLeida[][] = [];
  const revisar: ParaRevisar[] = [];
  let pagina = -1;
  let zonaHoja: Zona | null = null; // renglón "Carrera | Plan | Nivel" de la hoja
  const hojasSinNivel: { pagina: number; plan: number | null; zona: Zona | null }[] = [];
  let plan: number | null = null;
  let nivel: number | null = null;
  let subcols: Subcolumna[] | null = null;
  let borde = 0; // x a partir de la cual empiezan las columnas de los días
  let paso = 0; // ancho de media columna de día
  let enTabla = false;
  const diasVistos = new Map<number, number>();
  const marcasTP: { x: number; teoria: boolean }[] = [];
  let actual: { nombre: string; inicios: HoraEnCelda[]; renglones: HoraEnCelda[][]; origen: string; zona: Zona | null } | null = null;

  const cerrar = (finales: HoraEnCelda[], resto: string, origen: string, zonaFin: Zona | null = null) => {
    if (!actual || !subcols) return;
    if (!finales.length) {
      // No se leyó la "A:": las horas del último renglón con horas son las de fin.
      const conHoras = actual.renglones.filter((r) => r.length);
      if (conHoras.length >= 2) {
        finales = conHoras[conHoras.length - 1];
        actual.inicios = conHoras.slice(0, -1).flat();
      }
    }
    const nombre = limpiarNombre([actual.nombre, resto].filter(Boolean).join(' '));
    // Si no está en la malla (optativas, plan 2008), queda el nombre leído para revisar.
    // "Cálculo" en una hoja de nivel 2 es "Cálculo II": se desempata con la malla del plan y nivel de la hoja.
    const reconocida = materiaDe(nombre, lista) ?? porNivel(nombre, plan, nivel, fichas, lista);
    const materia = reconocida ?? (nombre.length >= 4 ? nombre : null);
    const zona = unirZonas(actual.zona, zonaFin);
    const libres = [...finales];
    for (const ini of actual.inicios) {
      const col = subcolumnaDe(ini.x, subcols, paso);
      if (!col) continue;
      // El fin es la hora del renglón "A:" en la misma columna.
      let mejor = -1;
      let dist = Infinity;
      libres.forEach((f, i) => {
        const d = Math.abs(f.x - ini.x);
        if (d < dist) { dist = d; mejor = i; }
      });
      const fin = mejor >= 0 && dist <= paso ? libres[mejor] : null;
      if (!fin || fin.hora <= ini.hora) {
        revisar.push({ motivo: 'sin-fin', texto: `${nombre}: ${NOMBRE_DIA[col.dia]} ${ini.hora} (sin hora de fin)`, materia, dia: col.dia, inicio: ini.hora, plan, pagina, zona });
        continue;
      }
      libres.splice(mejor, 1);
      const tipo: TipoClase | null = ini.marca ?? fin.marca ?? (col.teoria ? 'teoria' : null);
      const clase: ClaseLeida = { materia, dia: col.dia, inicio: ini.hora, fin: fin.hora, aula: null, tipo, nivel, seccion: null, plan, origen: `${nombre} · ${actual.origen} → ${origen}`.slice(0, 200), zona };
      clase.pagina = pagina;
      clases.push(clase);
    }
    if (!reconocida && actual.inicios.length) revisar.push({ motivo: 'materia', texto: nombre, materia, plan, pagina, zona });
    actual = null;
  };

  for (const f of filas) {
    if (f.pagina !== pagina) {
      cerrar([], '', '');
      if (nivel == null && pagina >= 0) {
        sinNivel.push(clases.filter((c) => c.nivel == null && c.pagina === pagina));
        hojasSinNivel.push({ pagina, plan, zona: zonaHoja });
      }
      pagina = f.pagina;
      zonaHoja = null;
      plan = null;
      nivel = null;
      subcols = null;
      enTabla = false;
      diasVistos.clear();
      marcasTP.length = 0;
    }
    const crudo = f.celdas.map((c) => c.texto).join(' ');
    const n = normalizar(crudo);
    if (!n) continue;

    const hoja = encabezadoHoja(f);
    if (hoja) {
      plan = hoja.plan ?? plan;
      nivel = hoja.nivel ?? nivel;
      zonaHoja = unirZonas(zonaHoja, f.zona);
      continue;
    }
    // Fila de días (a veces partida en dos renglones): arma las columnas, teoría a la izquierda y práctica a la derecha de cada día.
    const cab = encabezado(f) ?? (subcols || diasVistos.size ? diasSueltos(f) : null);
    if (cab && !/\d[:.]\d/.test(n)) {
      for (const c of cab) if (!diasVistos.has(c.dia)) diasVistos.set(c.dia, c.x);
      const armado = armarColumnas(diasVistos, marcasTP);
      if (armado) ({ subcols, paso, borde } = armado);
      enTabla = Boolean(subcols);
      continue;
    }
    if (/\bteoria\b|\bpract/.test(n) && !/\d[:.]\d/.test(n)) {
      // "TEORIA PRACT. TEORIA PRACT. …": la posición exacta de cada subcolumna.
      for (const c of f.celdas) {
        const palabras = c.texto.split(/\s+/);
        let pos = 0;
        for (const w of palabras) {
          const nw = normalizar(w);
          const centro = c.x0 + ((pos + w.length / 2) / (c.texto.length || 1)) * (c.x1 - c.x0);
          if (/^teor/.test(nw)) marcasTP.push({ x: centro, teoria: true });
          else if (/^pract/.test(nw)) marcasTP.push({ x: centro, teoria: false });
          pos += w.length + 1;
        }
      }
      const armado = armarColumnas(diasVistos, marcasTP);
      if (armado) ({ subcols, paso, borde } = armado);
      enTabla = Boolean(subcols);
      continue;
    }
    if (!enTabla || !subcols) continue;
    if (/\bdocentes\b/.test(n)) {
      cerrar([], '', '');
      enTabla = false;
      continue;
    }
    if (/\b(asignatura|dias de la semana)\b/.test(n)) continue;

    const izquierda = f.celdas.filter((c) => (c.x0 + c.x1) / 2 < borde);
    const horas = f.celdas.filter((c) => (c.x0 + c.x1) / 2 >= borde).flatMap(horasDeCelda);
    const etiquetas = izquierda.filter((c) => ETIQUETA.test(c.texto)).map((c) => normalizar(c.texto));
    let nombre = izquierda.filter((c) => !ETIQUETA.test(c.texto)).map((c) => c.texto).join(' ').trim();
    // "Bioproductos y Biocombustibles A:": la etiqueta pegada al nombre.
    const aPegada = /\s[¡!|]?a\s*:\s*$|\s[¡!|]a\s*$/i.test(nombre) || /\s[¡!|]?a\s*:?\s*$/i.test(nombre) && horas.length > 0;
    if (aPegada) nombre = nombre.replace(/\s+[¡!|]?a\s*:?\s*$/i, '').trim();
    const esA = etiquetas.includes('a') || aPegada;
    const esDe = etiquetas.includes('de');
    const letras = (nombre.match(/\p{L}/gu) ?? []).length;

    if (!actual) {
      if (esA) continue; // "A:" suelto: fila vacía
      if (letras < 3 && !horas.length) continue;
      actual = { nombre, inicios: horas, renglones: [horas], origen: crudo.trim(), zona: f.zona ?? null };
      continue;
    }
    if (esA) {
      cerrar(horas, nombre, crudo.trim(), f.zona);
      continue;
    }
    if (esDe && actual.inicios.length) {
      // Empieza otra materia sin que se haya leído el "A:" de la anterior.
      cerrar([], '', '');
      actual = { nombre, inicios: horas, renglones: [horas], origen: crudo.trim(), zona: f.zona ?? null };
      continue;
    }
    if (/^\W*\d{1,2}[.:]?\s+\p{L}{3}/u.test(nombre) && actual.inicios.length && (actual.nombre.match(/\p{L}/gu) ?? []).length >= 3) {
      // "4 Optativa 1: Portugués": fila numerada, otra materia.
      cerrar([], '', '');
      actual = { nombre, inicios: horas, renglones: [horas], origen: crudo.trim(), zona: f.zona ?? null };
      continue;
    }
    const mismasColumnas = horas.length > 0 && horas.every((h) => actual!.inicios.some((i) => Math.abs(i.x - h.x) <= paso));
    if (actual.inicios.length && horas.length && (letras < 3 || mismasColumnas)) {
      // El OCR no leyó la "A:", pero son las horas de fin (debajo de las de inicio).
      cerrar(horas, nombre, crudo.trim(), f.zona);
      continue;
    }
    // Más renglones de la misma materia (nombre en dos renglones, horas sueltas).
    actual.nombre = [actual.nombre, nombre].filter(Boolean).join(' ');
    actual.inicios.push(...horas);
    actual.renglones.push(horas);
    actual.origen = `${actual.origen} ${crudo.trim()}`;
    actual.zona = unirZonas(actual.zona, f.zona);
  }
  cerrar([], '', '');
  if (nivel == null && pagina >= 0) {
    sinNivel.push(clases.filter((c) => c.nivel == null && c.pagina === pagina));
    hojasSinNivel.push({ pagina, plan, zona: zonaHoja });
  }
  sinNivel.forEach((hoja, i) => {
    const n = nivelPorMaterias(hoja, fichas);
    if (n != null) for (const c of hoja) c.nivel = n;
    // Ni en la hoja ni por sus materias: que el admin lo elija.
    else if (hoja.length) revisar.push({ motivo: 'nivel', texto: `Hoja ${hojasSinNivel[i].pagina + 1}${hojasSinNivel[i].plan ? ` (plan ${hojasSinNivel[i].plan})` : ''}: no leímos el nivel`, plan: hojasSinNivel[i].plan, pagina: hojasSinNivel[i].pagina, zona: hojasSinNivel[i].zona });
  });
  return { clases, revisar };
}

/**
 * Materia de la malla que empieza con el nombre leído y es del plan y nivel
 * de la hoja ("Fenómenos de Transporte" en 8.º nivel → "Fenómenos de
 * Transporte III"). Solo si hay una sola.
 */
function porNivel(nombre: string, plan: number | null, nivel: number | null, fichas: FichaMateria[], lista: Patron[]): string | null {
  if (nivel == null || plan == null || !fichas.length) return null;
  const leido = clave(romanosOcr(nombre.replace(MARCA_TIPO, ' '))).split(' ').filter(Boolean);
  if (!leido.length || leido.join('').length < 4) return null;
  const candidatas = fichas.filter((f) => f.nivel === nivel && f.plan === plan && lista.some((p) => p.nombre === f.nombre)).filter((f) => {
    const w = clave(f.nombre).split(' ');
    if (!leido.every((x, i) => w[i] === x)) return false;
    // Una sola palabra ("Cálculo") solo si lo que falta es el número ("Cálculo II").
    return leido.length >= 2 || (w.length === 2 && /^(i|ii|iii|iv|v|vi)$/.test(w[1]));
  });
  const nombres = [...new Set(candidatas.map((f) => f.nombre))];
  return nombres.length === 1 ? nombres[0] : null;
}

/** Nivel más común de las materias de la hoja, según la malla de su plan. */
function nivelPorMaterias(hoja: ClaseLeida[], fichas: FichaMateria[]): number | null {
  const votos = new Map<number, number>();
  for (const c of hoja) {
    if (!c.materia) continue;
    const k = clave(c.materia);
    const delPlan = fichas.filter((f) => f.nivel != null && clave(f.nombre) === k && (c.plan == null || f.plan === c.plan));
    const ficha = delPlan[0];
    if (ficha?.nivel) votos.set(ficha.nivel, (votos.get(ficha.nivel) ?? 0) + 1);
  }
  const mejor = [...votos.entries()].sort((a, b) => b[1] - a[1])[0];
  return mejor ? mejor[0] : null;
}

/** Nombre de la materia sin número de fila, etiquetas ni errores típicos del OCR. */
export function limpiarNombre(t: string): string {
  let n = t.replace(/\s+/g, ' ').trim();
  // Número de fila ("1", "6.", "2:") o basura del borde ("Si", "uu", "[") y etiquetas sueltas al principio.
  for (let i = 0; i < 4; i++) n = n.replace(/^(?:[^\p{L}]+|(?:s[il1]|uu|a|de|del|l|i)(?![\p{L}])[\s:.]*)\s*/iu, '').trim();
  n = n.replace(/\s+(?:de|a)\s*:$/i, '').replace(/[\s:;,.\-–]+$/, '');
  // Números romanos que el OCR lee con eles: "Il", "ll", "li", "Ill".
  return romanosOcr(n);
}

/** Días sueltos de un renglón ("1 ¦ SABADO" cuando la fila de días quedó partida). */
function diasSueltos(f: FilaDoc): Columna[] | null {
  const cols: Columna[] = [];
  for (const c of f.celdas) {
    const d = diaDe(normalizar(c.texto).split(' ').find((w) => diaDe(w) != null) ?? '');
    if (d != null && normalizar(c.texto).split(' ').length <= 2) cols.push({ dia: d, x: (c.x0 + c.x1) / 2 });
  }
  return cols.length ? cols : null;
}

/**
 * Columnas de la grilla: lunes a sábado en línea recta (x = a + b·día),
 * ajustada con los días que se leyeron, así un día que el OCR no leyó
 * ("NIE", o "VIE" perdido) igual tiene su lugar. Las marcas TEORIA/PRACT.
 * afinan cada subcolumna.
 */
function armarColumnas(dias: Map<number, number>, marcas: { x: number; teoria: boolean }[]): { subcols: Subcolumna[]; paso: number; borde: number } | null {
  const puntos = [...dias.entries()].filter(([d]) => d >= 1 && d <= 6);
  let a: number;
  let b: number;
  if (puntos.length >= 2) {
    const mx = puntos.reduce((t, [d]) => t + d, 0) / puntos.length;
    const my = puntos.reduce((t, [, x]) => t + x, 0) / puntos.length;
    const num = puntos.reduce((t, [d, x]) => t + (d - mx) * (x - my), 0);
    const den = puntos.reduce((t, [d]) => t + (d - mx) ** 2, 0);
    b = num / den;
    a = my - b * mx;
  } else {
    // Sin días: de las marcas TEORIA/PRACT., en pares de izquierda a derecha.
    const t = marcas.filter((m) => m.teoria).map((m) => m.x).sort((x, y) => x - y);
    if (t.length < 3) return null;
    b = (t[t.length - 1] - t[0]) / (t.length - 1);
    a = t[0] + b / 4 - b;
  }
  if (!(b > 20)) return null;
  const paso = b / 4;
  const subcols: Subcolumna[] = [];
  for (let d = 1; d <= 6; d++) {
    const centro = a + b * d;
    for (const teoria of [true, false]) {
      const ideal = teoria ? centro - paso : centro + paso;
      const marca = marcas.filter((m) => m.teoria === teoria).sort((m1, m2) => Math.abs(m1.x - ideal) - Math.abs(m2.x - ideal))[0];
      subcols.push({ dia: d, teoria, x: marca && Math.abs(marca.x - ideal) < paso ? marca.x : ideal });
    }
  }
  return { subcols, paso, borde: a + b - b / 2 - paso * 0.6 };
}

function subcolumnaDe(x: number, subcols: Subcolumna[], paso: number): Subcolumna | null {
  let mejor: Subcolumna | null = null;
  let dist = Infinity;
  for (const c of subcols) {
    const d = Math.abs(c.x - x);
    if (d < dist) { dist = d; mejor = c; }
  }
  return mejor && dist <= paso * 1.3 ? mejor : null;
}
