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
 *   ("Química General   Lunes y Miércoles   07:00 a 09:00   Aula 12").
 *
 * Lo que no reconoce lo devuelve igual (sin materia) para que el admin lo
 * corrija. Sin dependencias, para probarlo con node --test.
 */
import type { Celda, FilaDoc } from './ocr/documento.ts';
import { aulaEn, clave, materiasEn, normalizar, parecida, patrones, type Patron } from './horario-finales.ts';
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
  /** Texto de la celda o renglón del PDF (para revisar). */
  origen: string;
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
  let m = /\b(primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo)\s+(?:nivel|semestre|curso)\b/.exec(n);
  if (m) return ORDINALES[m[1]];
  m = /\b(\d{1,2})\s*\.?\s*(?:er|ero|do|ro|to|vo|no|mo|o|°|º)?\s*\.?\s*(?:nivel|semestre|curso)\b/.exec(n);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 10) return Number(m[1]);
  m = /\b(?:nivel|semestre|curso)\s*:?\s*(\d{1,2}|i{1,3}|iv|v|vi{0,3}|ix|x)\b/.exec(n);
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

export function leerHorarioClases(filas: FilaDoc[], materias: string[]): { clases: ClaseLeida[]; sinUsar: string[] } {
  const lista = patrones(materias);
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
      cols = cab;
      ultimaFila = null;
      continue;
    }
    if (esTitulo(f)) {
      cerrarAbierta(null);
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

  return { clases: unirSeguidas(clases), sinUsar };
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
      salida[salida.length - 1] = { ...p, fin: c.fin };
    } else {
      salida.push(c);
    }
  }
  return salida;
}

export const NOMBRE_DIA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Nivel para mostrar: "1.er nivel". */
export const textoNivel = (n: number) => `${n}.${n === 1 || n === 3 ? 'er' : 'º'} nivel`;
