/**
 * Lee la fecha de vencimiento del texto que el celular reconoció en la
 * foto del carnet físico. Hay varios diseños de carnet vigentes, así que
 * no se asume un formato fijo: se buscan todas las fechas y se elige la
 * que está junto a "vence", "válido hasta", "vigencia"…; si no hay
 * ninguna con esas palabras, la fecha más lejana.
 *
 * Formatos que entiende: 31/12/2027, 31-12-27, 31.12.2027, 12/2027,
 * "diciembre 2027", "dic. 2027", "2.º semestre 2027", "2do sem. 2027",
 * "II semestre 2027" y un año solo ("vence 2028" = fin de 2028).
 */
import { finDeSemestre } from './carnet.ts';

export interface Vencimiento {
  /** AAAA-MM-DD */
  iso: string;
  /** El texto tal como se leyó, para mostrarlo. */
  leido: string;
  /** true si estaba junto a "vence", "válido hasta", etc. */
  conPalabraClave: boolean;
}

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
  jan: 1, apr: 4, aug: 8, dec: 12,
};

const CLAVE = /venc|vence|v[aá]lid|hasta|vigen|expir|exp\b|caduc|v[aá]lido/i;

const dos = (n: number) => String(n).padStart(2, '0');
const anio4 = (a: number) => (a < 100 ? 2000 + a : a);
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

function iso(a: number, m: number, d?: number): string | null {
  if (m < 1 || m > 12 || a < 2000 || a > 2100) return null;
  const dia = d ?? ultimoDia(a, m);
  if (dia < 1 || dia > ultimoDia(a, m)) return null;
  return `${a}-${dos(m)}-${dos(dia)}`;
}

/** Los errores típicos del reconocimiento: O por 0, l/I por 1. */
function limpiar(t: string) {
  return t
    .normalize('NFC')
    .replace(/(?<=\d)[Oo](?=\d|\b)|(?<=\b)[Oo](?=\d)/g, '0')
    .replace(/(?<=\d)[lI|](?=\d)/g, '1');
}

function fechasEn(linea: string): { iso: string; leido: string }[] {
  const t = limpiar(linea);
  const r: { iso: string; leido: string }[] = [];
  const usados: [number, number][] = [];
  const libre = (i: number, largo: number) => !usados.some(([a, b]) => i < b && i + largo > a);
  // Una fecha mal formada (31/02) igual ocupa su lugar, para que el año
  // suelto no la tome como "fin de 2028".
  const anotar = (m: RegExpMatchArray, valor: string | null) => {
    if (m.index == null || !libre(m.index, m[0].length)) return;
    usados.push([m.index, m.index + m[0].length]);
    if (valor) r.push({ iso: valor, leido: m[0].trim() });
  };

  // 31/12/2027, 31-12-27, 31.12.2027
  for (const m of t.matchAll(/\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})\b/g)) {
    anotar(m, iso(anio4(Number(m[3])), Number(m[2]), Number(m[1])));
  }
  // 2.º semestre 2027, 2do sem 2027, II semestre 2027, 1er. sem. 27
  for (const m of t.matchAll(/\b(1|2|I{1,2})\s*[.ºo°ª]*(?:er|do|ro)?[.ºo°ª]*\s*sem(?:estre)?\.?\s*(?:de(?:l)?\s*)?(\d{4}|\d{2})\b/gi)) {
    const s = m[1] === '1' || m[1].toUpperCase() === 'I' ? 1 : 2;
    anotar(m, finDeSemestre({ semestre: s, anio: anio4(Number(m[2])) }));
  }
  // diciembre 2027, dic. 2027, dic/27
  for (const m of t.matchAll(/\b([a-záéíóú]{3,10})\.?\s*(?:de(?:l)?\s+|[/\-]\s*)?(\d{4}|\d{2})\b/gi)) {
    const mes = MESES[m[1].slice(0, 3).toLowerCase()];
    if (mes) anotar(m, iso(anio4(Number(m[2])), mes));
    else continue;
  }
  // 12/2027, 12-27
  for (const m of t.matchAll(/\b(\d{1,2})\s*[/\-]\s*(\d{4}|\d{2})\b/g)) {
    anotar(m, iso(anio4(Number(m[2])), Number(m[1])));
  }
  // Un año solo, únicamente si la línea dice "vence"/"válido": fin de ese año.
  if (CLAVE.test(t)) {
    for (const m of t.matchAll(/\b(20\d{2})\b/g)) anotar(m, iso(Number(m[1]), 12, 31));
  }
  return r;
}

/**
 * Elige el vencimiento entre las líneas reconocidas. Devuelve null si no
 * encontró ninguna fecha.
 */
export function leerVencimiento(lineas: string[]): Vencimiento | null {
  // Se parte cada bloque en renglones; la palabra clave puede estar en el
  // renglón de arriba ("VENCE" / "12/2027").
  const renglones = lineas.flatMap((l) => l.split(/\r?\n/)).map((l) => l.trim()).filter(Boolean);
  const candidatas: Vencimiento[] = [];
  renglones.forEach((r, i) => {
    const clave = CLAVE.test(r) || (i > 0 && CLAVE.test(renglones[i - 1]) && !/\d/.test(renglones[i - 1]));
    for (const f of fechasEn(r)) candidatas.push({ ...f, conPalabraClave: clave });
  });
  if (!candidatas.length) return null;
  const conClave = candidatas.filter((c) => c.conPalabraClave);
  const grupo = conClave.length ? conClave : candidatas;
  return grupo.reduce((a, b) => (b.iso > a.iso ? b : a));
}
