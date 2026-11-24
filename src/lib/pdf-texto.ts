/**
 * Saca el texto de un PDF "de verdad": los que exporta Word, Excel,
 * LibreOffice o el navegador. A diferencia de texto-pdf.ts (pensado para el
 * extracto del EALU, sin comprimir), este lee:
 *
 * - flujos comprimidos (FlateDecode) y objetos guardados dentro de otros
 *   (ObjStm, PDF 1.5+);
 * - fuentes con mapa a Unicode (ToUnicode), incluidas las de 2 bytes
 *   (Identity-H), que es como Word y Chrome guardan los textos;
 * - posiciones con Td, TD, Tm, T*, TL y la matriz cm (q/Q).
 *
 * Devuelve una línea por cada altura de la página, con las columnas
 * separadas por tres espacios, de arriba hacia abajo. Un PDF escaneado (solo
 * imágenes) devuelve ''. Todo pasa en el teléfono, sin red.
 */
import { unzlibSync, inflateSync } from 'fflate';
import type { Celda, FilaDoc } from './ocr/documento.ts';

type Matriz = [number, number, number, number, number, number];
const IDENTIDAD: Matriz = [1, 0, 0, 1, 0, 0];

/** a × b (primero a, después b), como en el PDF. */
function multiplicar(a: Matriz, b: Matriz): Matriz {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

interface Objeto {
  dicc: string;
  /** Flujo ya descomprimido (como texto latin1), si tiene. */
  flujo?: string;
}

interface Trozo {
  x: number;
  y: number;
  /** Dónde termina (x + ancho del texto). */
  fin: number;
  tam: number;
  texto: string;
  orden: number;
}

/** Fuente: cómo pasar los bytes de una cadena a texto. */
interface Fuente {
  bytes: 1 | 2;
  mapa: Map<number, string> | null;
  /** Ancho de cada código en milésimas del tamaño de letra. */
  anchos: Map<number, number>;
  anchoPorDefecto: number;
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  const paso = 0x2000; // bloques chicos: seguro en Hermes
  for (let i = 0; i < bytes.length; i += paso) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + paso)));
  }
  return s;
}

function aBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

function descomprimir(crudo: string): string | null {
  const b = aBytes(crudo);
  try {
    return latin1(unzlibSync(b));
  } catch {
    try {
      return latin1(inflateSync(b));
    } catch {
      // Algunos generadores cortan el final: se prueba sin los últimos bytes.
      try {
        return latin1(inflateSync(b.subarray(2)));
      } catch {
        return null;
      }
    }
  }
}

/** Lee todos los objetos "n 0 obj ... endobj" del archivo. */
function leerObjetos(pdf: string): Map<number, Objeto> {
  const objetos = new Map<number, Objeto>();
  const inicio = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = inicio.exec(pdf))) {
    const num = Number(m[1]);
    const desde = m.index + m[0].length;
    const finObj = pdf.indexOf('endobj', desde);
    if (finObj < 0) break;
    let cuerpo = pdf.slice(desde, finObj);
    const s = cuerpo.search(/\bstream\r?\n/);
    let obj: Objeto;
    if (s >= 0) {
      const dicc = cuerpo.slice(0, s);
      const arranque = cuerpo.indexOf('\n', s) + 1;
      // Con /Length directo se corta justo; si no, hasta "endstream".
      const largo = /\/Length\s+(\d+)(?!\d|\s+\d+\s+R)/.exec(dicc);
      let crudo: string;
      if (largo && arranque + Number(largo[1]) <= cuerpo.length) {
        crudo = cuerpo.slice(arranque, arranque + Number(largo[1]));
      } else {
        const fin = cuerpo.lastIndexOf('endstream');
        crudo = cuerpo.slice(arranque, fin < 0 ? undefined : fin).replace(/\r?\n$/, '');
      }
      let flujo: string | undefined = crudo;
      if (/\/Filter\s*\[?\s*\/FlateDecode\s*\]?/.test(dicc)) flujo = descomprimir(crudo) ?? undefined;
      else if (/\/Filter/.test(dicc)) flujo = undefined; // imágenes y otros formatos: no interesan
      obj = { dicc, flujo };
    } else {
      obj = { dicc: cuerpo };
    }
    objetos.set(num, obj);
    inicio.lastIndex = finObj;
    cuerpo = '';
  }
  // Objetos guardados dentro de flujos de objetos (PDF 1.5+).
  for (const o of [...objetos.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dicc) || !o.flujo) continue;
    const n = Number(/\/N\s+(\d+)/.exec(o.dicc)?.[1] ?? 0);
    const primero = Number(/\/First\s+(\d+)/.exec(o.dicc)?.[1] ?? 0);
    const cabecera = o.flujo.slice(0, primero).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = cabecera[i * 2];
      const desde = primero + cabecera[i * 2 + 1];
      const hasta = i + 1 < n ? primero + cabecera[i * 2 + 3] : o.flujo.length;
      if (!objetos.has(num)) objetos.set(num, { dicc: o.flujo.slice(desde, hasta) });
    }
  }
  return objetos;
}

/** Valor de una clave en un diccionario: referencia, diccionario, arreglo o simple. */
function valor(dicc: string, clave: string): string | null {
  const re = new RegExp(`/${clave}(?![A-Za-z0-9])\\s*`, 'g');
  const m = re.exec(dicc);
  if (!m) return null;
  const resto = dicc.slice(re.lastIndex);
  const ref = /^(\d+)\s+\d+\s+R/.exec(resto);
  if (ref) return ref[0];
  if (resto.startsWith('<<')) return bloque(resto, '<<', '>>');
  if (resto.startsWith('[')) return bloque(resto, '[', ']');
  return /^[^\s/<>[\]]+|^\/[^\s/<>[\]()]+/.exec(resto)?.[0] ?? null;
}

/** Recorta un bloque balanceado (<<...>> o [...]) desde el principio. */
function bloque(s: string, abre: string, cierra: string): string {
  let nivel = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith(abre, i)) {
      nivel++;
      i += abre.length - 1;
    } else if (s.startsWith(cierra, i)) {
      nivel--;
      i += cierra.length - 1;
      if (nivel === 0) return s.slice(0, i + 1);
    }
  }
  return s;
}

function resolver(objetos: Map<number, Objeto>, v: string | null): Objeto | null {
  if (!v) return null;
  const ref = /^(\d+)\s+\d+\s+R$/.exec(v.trim());
  if (ref) return objetos.get(Number(ref[1])) ?? null;
  return { dicc: v };
}

function referencias(v: string | null): number[] {
  if (!v) return [];
  return [...v.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
}

/** Hex "<00410042>" o "00410042" → números de 1 o 2 bytes. */
function hexANumero(h: string): number {
  return parseInt(h.replace(/[<>\s]/g, '') || '0', 16);
}

function hexATexto(h: string): string {
  const limpio = h.replace(/[<>\s]/g, '');
  let s = '';
  for (let i = 0; i + 3 < limpio.length + 0; i += 4) s += String.fromCharCode(parseInt(limpio.slice(i, i + 4), 16));
  if (limpio.length === 2) s = String.fromCharCode(parseInt(limpio, 16));
  return s;
}

/** Lee un CMap ToUnicode (bfchar y bfrange). */
function leerCMap(cmap: string): { mapa: Map<number, string>; bytes: 1 | 2 } {
  const mapa = new Map<number, string>();
  let bytes: 1 | 2 = 1;
  const rango = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(cmap);
  if (rango && /<[0-9A-Fa-f]{4}>/.test(rango[1])) bytes = 2;
  for (const b of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      if (p[1].length >= 4) bytes = 2;
      mapa.set(hexANumero(p[1]), hexATexto(p[2]));
    }
  }
  for (const b of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
      if (p[1].length >= 4) bytes = 2;
      const desde = hexANumero(p[1]);
      const hasta = Math.min(hexANumero(p[2]), desde + 0xffff);
      if (p[3].startsWith('[')) {
        const lista = [...p[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => hexATexto(x[1]));
        for (let c = desde; c <= hasta && c - desde < lista.length; c++) mapa.set(c, lista[c - desde]);
      } else {
        const base = p[3].replace(/[<>]/g, '');
        const primero = hexANumero(base.slice(-4));
        const prefijo = hexATexto(base.slice(0, -4));
        for (let c = desde; c <= hasta; c++) mapa.set(c, prefijo + String.fromCharCode(primero + (c - desde)));
      }
    }
  }
  return { mapa, bytes };
}

function numeros(objetos: Map<number, Objeto>, v: string | null): number[] {
  const o = resolver(objetos, v);
  return o ? (o.dicc.match(/[-+]?\d*\.?\d+/g) ?? []).map(Number) : [];
}

/** Anchos de una fuente simple (/FirstChar + /Widths) o CID (/W). */
function leerAnchos(objetos: Map<number, Objeto>, obj: Objeto, tipo0: boolean): { anchos: Map<number, number>; anchoPorDefecto: number } {
  const anchos = new Map<number, number>();
  if (!tipo0) {
    const primero = Number(valor(obj.dicc, 'FirstChar') ?? 0);
    numeros(objetos, valor(obj.dicc, 'Widths')).forEach((w, i) => anchos.set(primero + i, w));
    return { anchos, anchoPorDefecto: 500 };
  }
  const desc = resolver(objetos, valor(obj.dicc, 'DescendantFonts'));
  const cid = desc ? resolver(objetos, referencias(desc.dicc).length ? `${referencias(desc.dicc)[0]} 0 R` : desc.dicc) : null;
  if (!cid) return { anchos, anchoPorDefecto: 1000 };
  const dw = Number(valor(cid.dicc, 'DW') ?? 1000);
  const w = resolver(objetos, valor(cid.dicc, 'W'));
  if (w) {
    // [c [w1 w2 ...]  c1 c2 w ...]
    const tokens = w.dicc.replace(/^\[|\]$/g, '').match(/\[[^\]]*\]|[-+]?\d*\.?\d+/g) ?? [];
    for (let i = 0; i < tokens.length; ) {
      const c = Number(tokens[i]);
      const sig = tokens[i + 1];
      if (sig?.startsWith('[')) {
        (sig.match(/[-+]?\d*\.?\d+/g) ?? []).map(Number).forEach((x, j) => anchos.set(c + j, x));
        i += 2;
      } else {
        const hasta = Number(sig);
        const ancho = Number(tokens[i + 2]);
        for (let k = c; k <= hasta && k - c < 0xffff; k++) anchos.set(k, ancho);
        i += 3;
      }
    }
  }
  return { anchos, anchoPorDefecto: dw };
}

function leerFuente(objetos: Map<number, Objeto>, obj: Objeto | null): Fuente {
  if (!obj) return { bytes: 1, mapa: null, anchos: new Map(), anchoPorDefecto: 500 };
  const tipo0 = /\/Subtype\s*\/Type0/.test(obj.dicc);
  const { anchos, anchoPorDefecto } = leerAnchos(objetos, obj, tipo0);
  const tu = resolver(objetos, valor(obj.dicc, 'ToUnicode'));
  if (tu?.flujo) {
    const { mapa, bytes } = leerCMap(tu.flujo);
    return { bytes: tipo0 ? 2 : bytes, mapa, anchos, anchoPorDefecto };
  }
  return { bytes: tipo0 ? 2 : 1, mapa: null, anchos, anchoPorDefecto };
}

/** Bytes de una cadena (literal o hex) del flujo de contenido. */
function bytesDeCadena(t: string): string {
  if (t.startsWith('<')) {
    const h = t.slice(1, -1).replace(/\s/g, '');
    let s = '';
    for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt((h.slice(i, i + 2) + '0').slice(0, 2), 16));
    return s;
  }
  return t.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, e: string) => {
    switch (e) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'b': return '\b';
      case 'f': return '\f';
      case '(': return '(';
      case ')': return ')';
      case '\\': return '\\';
    }
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8) & 0xff);
    return '';
  });
}

/** Texto y ancho (en milésimas) de los bytes de una cadena. */
function decodificar(crudo: string, f: Fuente | undefined): { texto: string; ancho: number } {
  let texto = '';
  let ancho = 0;
  const paso = f?.bytes === 2 ? 2 : 1;
  for (let i = 0; i + paso - 1 < crudo.length; i += paso) {
    const c = paso === 2 ? (crudo.charCodeAt(i) << 8) | crudo.charCodeAt(i + 1) : crudo.charCodeAt(i);
    if (!f) texto += String.fromCharCode(c);
    else if (f.mapa?.has(c)) texto += f.mapa.get(c);
    else if (paso === 1) texto += String.fromCharCode(c);
    ancho += f ? f.anchos.get(c) ?? f.anchoPorDefecto : 500;
  }
  return { texto, ancho };
}

const TOKEN = /\((?:\\[\s\S]|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\[|\]|<<|>>|\/[^\s/[\]()<>{}%]+|[-+]?\d*\.?\d+|[A-Za-z'"*][A-Za-z0-9'"*]*|%[^\n]*/g;

/** Trozos de texto de una página, con su posición en la página. */
function trozosDePagina(contenido: string, fuentes: Map<string, Fuente>): Trozo[] {
  const trozos: Trozo[] = [];
  let pila: string[] = [];
  let arreglo: string[] | null = null;
  let ctm: Matriz = IDENTIDAD;
  const pilaCtm: Matriz[] = [];
  let tm: Matriz = IDENTIDAD;
  let tlm: Matriz = IDENTIDAD;
  let interlineado = 0;
  let tamano = 1;
  let fuente: Fuente | undefined;
  let orden = 0;

  // Dentro de TJ: cadenas y desplazamientos (en milésimas, negativos = hacia la derecha).
  const emitir = (partes: string[]) => {
    let texto = '';
    let avance = 0;
    for (const p of partes) {
      if (/^[-+]?\d*\.?\d+$/.test(p)) {
        const d = Number(p);
        // Un hueco grande dentro de un TJ es un espacio entre palabras.
        if (d < -180 && texto && !texto.endsWith(' ')) texto += ' ';
        avance -= d;
        continue;
      }
      const r = decodificar(bytesDeCadena(p), fuente);
      texto += r.texto;
      avance += r.ancho;
    }
    const m = multiplicar(tm, ctm);
    const escalaX = Math.hypot(m[0], m[1]) || 1;
    const escalaY = Math.hypot(m[2], m[3]) || 1;
    const ancho = (avance / 1000) * tamano * escalaX;
    if (texto.trim()) trozos.push({ x: m[4], y: m[5], fin: m[4] + ancho, tam: Math.abs(tamano * escalaY), texto, orden: orden++ });
    // El cursor avanza lo que ocupó el texto.
    tm = multiplicar([1, 0, 0, 1, (avance / 1000) * tamano, 0], tm);
  };
  const nuevaLinea = (tx: number, ty: number) => {
    tlm = multiplicar([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };

  for (const m of contenido.matchAll(TOKEN)) {
    const t = m[0];
    if (t.startsWith('%')) continue;
    if (t === '[') {
      arreglo = [];
      continue;
    }
    if (t === ']') {
      pila.push('[' + (arreglo ?? []).join('\u0000') + ']');
      arreglo = null;
      continue;
    }
    if (arreglo) {
      if (t.startsWith('(') || (t.startsWith('<') && t !== '<<') || /^[-+]?\d*\.?\d+$/.test(t)) arreglo.push(t);
      continue;
    }
    if (!/^[A-Za-z'"*]/.test(t)) {
      pila.push(t);
      continue;
    }
    const n = pila.map(Number);
    const ult = (i: number) => n[n.length - i] ?? 0;
    switch (t) {
      case 'q':
        pilaCtm.push(ctm);
        break;
      case 'Q':
        ctm = pilaCtm.pop() ?? IDENTIDAD;
        break;
      case 'cm':
        ctm = multiplicar([ult(6), ult(5), ult(4), ult(3), ult(2), ult(1)], ctm);
        break;
      case 'BT':
        tm = tlm = IDENTIDAD;
        break;
      case 'Tf': {
        fuente = fuentes.get(pila[pila.length - 2]?.slice(1) ?? '');
        tamano = ult(1) || 1;
        break;
      }
      case 'TL':
        interlineado = ult(1);
        break;
      case 'Td':
        nuevaLinea(ult(2), ult(1));
        break;
      case 'TD':
        interlineado = -ult(1);
        nuevaLinea(ult(2), ult(1));
        break;
      case 'Tm':
        tm = tlm = [ult(6), ult(5), ult(4), ult(3), ult(2), ult(1)];
        break;
      case 'T*':
        nuevaLinea(0, -interlineado);
        break;
      case 'Tj':
        emitir([pila[pila.length - 1] ?? '()']);
        break;
      case "'":
        nuevaLinea(0, -interlineado);
        emitir([pila[pila.length - 1] ?? '()']);
        break;
      case '"':
        nuevaLinea(0, -interlineado);
        emitir([pila[pila.length - 1] ?? '()']);
        break;
      case 'TJ': {
        const arr = pila[pila.length - 1] ?? '[]';
        emitir(arr.slice(1, -1).split('\u0000').filter(Boolean));
        break;
      }
    }
    pila = [];
  }
  return trozos;
}

/**
 * Junta los trozos en líneas. Dos trozos van en la misma línea si su altura
 * coincide dentro de un tercio del tamaño de letra. Los trozos pegados (sin
 * hueco) se unen sin separador; los alejados, con tres espacios.
 */
export function armarLineas(trozos: Trozo[]): string[] {
  const ordenados = [...trozos].sort((a, b) => b.y - a.y || a.orden - b.orden);
  const filas: Trozo[][] = [];
  for (const t of ordenados) {
    const fila = filas[filas.length - 1];
    const tol = Math.max(1, Math.min(t.tam, fila?.[0].tam ?? t.tam) / 3);
    if (fila && Math.abs(fila[0].y - t.y) <= tol) fila.push(t);
    else filas.push([t]);
  }
  return filas.map((fila) => {
    fila.sort((a, b) => a.x - b.x || a.orden - b.orden);
    let linea = '';
    let finAnterior = -Infinity;
    for (const t of fila) {
      const hueco = t.x - finAnterior;
      let sep = '';
      if (linea !== '') {
        if (hueco > t.tam * 1.5) sep = '   ';
        else if (hueco > t.tam * 0.18 && !linea.endsWith(' ') && !t.texto.startsWith(' ')) sep = ' ';
      }
      linea += sep + t.texto;
      finAnterior = Math.max(finAnterior, t.fin);
    }
    return linea.replace(/[ \t]+$/, '').replace(/ {4,}/g, '   ');
  });
}

/** Páginas en orden, siguiendo el árbol /Pages y heredando los recursos. */
function paginas(objetos: Map<number, Objeto>): { obj: Objeto; recursos: string | null }[] {
  const salida: { obj: Objeto; recursos: string | null }[] = [];
  const vistos = new Set<number>();
  const recorrer = (num: number, recursos: string | null) => {
    if (vistos.has(num)) return;
    vistos.add(num);
    const o = objetos.get(num);
    if (!o) return;
    const propios = valor(o.dicc, 'Resources') ?? recursos;
    if (/\/Type\s*\/Pages\b/.test(o.dicc)) {
      for (const k of referencias(valor(o.dicc, 'Kids'))) recorrer(k, propios);
    } else if (/\/Type\s*\/Page\b/.test(o.dicc)) {
      salida.push({ obj: o, recursos: propios });
    }
  };
  const catalogo = [...objetos.values()].find((o) => /\/Type\s*\/Catalog\b/.test(o.dicc));
  const raiz = referencias(catalogo ? valor(catalogo.dicc, 'Pages') : null)[0];
  if (raiz != null) recorrer(raiz, null);
  if (!salida.length) {
    for (const [num, o] of objetos) if (/\/Type\s*\/Page\b/.test(o.dicc)) recorrer(num, null);
  }
  return salida;
}

/** Trozos de texto de cada página del PDF, en orden. [] si no hay texto. */
function trozosPorPagina(bytes: Uint8Array): Trozo[][] {
  const pdf = latin1(bytes);
  if (!pdf.startsWith('%PDF')) return [];
  if (/\/Encrypt\s/.test(pdf)) return [];
  const objetos = leerObjetos(pdf);
  const cacheFuentes = new Map<number, Fuente>();
  const salida: Trozo[][] = [];
  for (const p of paginas(objetos)) {
    const recursos = resolver(objetos, p.recursos);
    const fuentes = new Map<string, Fuente>();
    const dicFuentes = recursos ? resolver(objetos, valor(recursos.dicc, 'Font')) : null;
    if (dicFuentes) {
      for (const m of dicFuentes.dicc.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
        const num = Number(m[2]);
        if (!cacheFuentes.has(num)) cacheFuentes.set(num, leerFuente(objetos, objetos.get(num) ?? null));
        fuentes.set(m[1], cacheFuentes.get(num)!);
      }
    }
    const contenido = referencias(valor(p.obj.dicc, 'Contents'))
      .map((r) => objetos.get(r)?.flujo ?? '')
      .join('\n');
    salida.push(trozosDePagina(contenido, fuentes));
  }
  return salida;
}

/**
 * Texto del PDF: líneas de cada página, con una línea vacía entre páginas.
 * '' si no hay texto (PDF escaneado, dañado o protegido).
 */
export function textoDePdfGeneral(bytes: Uint8Array): string {
  return trozosPorPagina(bytes)
    .map((t) => armarLineas(t))
    .filter((l) => l.length)
    .map((l) => l.join('\n'))
    .join('\n\n');
}

/**
 * Renglones del PDF con sus celdas y posiciones, como los del OCR
 * (ocr/documento.ts), para leer tablas en las que hay celdas vacías.
 * La x crece hacia la derecha igual que en el OCR.
 */
export function filasDePdfGeneral(bytes: Uint8Array): FilaDoc[] {
  const filas: FilaDoc[] = [];
  trozosPorPagina(bytes).forEach((trozos, pagina) => {
    const ordenados = [...trozos].sort((a, b) => b.y - a.y || a.orden - b.orden);
    const grupos: Trozo[][] = [];
    for (const t of ordenados) {
      const g = grupos[grupos.length - 1];
      const tol = Math.max(1, Math.min(t.tam, g?.[0].tam ?? t.tam) / 3);
      if (g && Math.abs(g[0].y - t.y) <= tol) g.push(t);
      else grupos.push([t]);
    }
    for (const g of grupos) {
      g.sort((a, b) => a.x - b.x || a.orden - b.orden);
      const celdas: Celda[] = [];
      for (const t of g) {
        const texto = t.texto.replace(/\s+/g, ' ').trim();
        if (!texto) continue;
        const ultima = celdas[celdas.length - 1];
        if (ultima && t.x - ultima.x1 <= t.tam * 1.5) {
          ultima.texto += (t.x - ultima.x1 > t.tam * 0.18 ? ' ' : '') + texto;
          ultima.x1 = Math.max(ultima.x1, t.fin);
        } else {
          celdas.push({ texto, x0: t.x, x1: t.fin });
        }
      }
      // En el PDF la y crece hacia arriba: se invierte para que sea como en el OCR.
      if (celdas.length) filas.push({ pagina, celdas, y: -g[0].y, alto: g[0].tam });
    }
  });
  return filas;
}
