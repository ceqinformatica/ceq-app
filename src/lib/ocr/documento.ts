/**
 * Lo que devuelve el OCR (palabras con su rectángulo) y cómo pasarlo a
 * renglones de texto con las columnas separadas por tres espacios, igual que
 * pdf-texto.ts. Así los lectores de horarios y calendarios sirven para un PDF
 * con texto y para uno escaneado. Sin dependencias, para probarlo con node.
 */

export interface PalabraOcr {
  t: string;
  /** Rectángulo en píxeles de la página dibujada (y crece hacia abajo). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Confianza 0–100. */
  c: number;
}

export interface PaginaOcr {
  ancho: number;
  alto: number;
  palabras: PalabraOcr[];
}

export interface RenglonOcr {
  palabras: PalabraOcr[];
  /** Centro vertical y alto típico de letra del renglón. */
  y: number;
  alto: number;
}

/** Palabras sueltas que el OCR inventa con manchas, firmas y sellos. */
function esRuido(p: PalabraOcr): boolean {
  // Restos de bordes de tabla: rayas y barras sueltas.
  if (p.t !== '|' && /^[|—_¡!\[\]()~=«»“”"'`.,:;]+$/.test(p.t)) return true;
  if (p.c >= 60) return false;
  const limpio = p.t.replace(/[^\p{L}\p{N}]/gu, '');
  if (!limpio) return true;
  if (p.c < 30 && limpio.length <= 2) return true;
  return false;
}

const mediana = (v: number[]) => {
  if (!v.length) return 0;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
};

/**
 * Agrupa las palabras en renglones: una palabra se suma al renglón cuya
 * última palabra se le superpone más en vertical (al menos la mitad del alto
 * de la más baja). Tolera hojas un poco torcidas porque compara con la
 * palabra anterior del renglón, no con la primera, y las tildes o las letras
 * con cola no la sacan del renglón.
 */
export function renglones(pagina: PaginaOcr): RenglonOcr[] {
  const palabras = pagina.palabras.filter((p) => !esRuido(p) && p.y1 > p.y0 && p.x1 > p.x0);
  if (!palabras.length) return [];
  const altoTipico = mediana(palabras.map((p) => p.y1 - p.y0)) || 20;
  const centro = (p: PalabraOcr) => (p.y0 + p.y1) / 2;
  // Las palabras muy altas (firmas, sellos) miden mal el renglón: se recortan al alto típico.
  const banda = (p: PalabraOcr): [number, number] => {
    const h = Math.min(p.y1 - p.y0, altoTipico * 1.3);
    const c = centro(p);
    return [c - h / 2, c + h / 2];
  };
  const porX = [...palabras].sort((a, b) => a.x0 - b.x0);
  const filas: { palabras: PalabraOcr[]; banda: [number, number] }[] = [];
  for (const p of porX) {
    const [a, b] = banda(p);
    let mejor: (typeof filas)[number] | null = null;
    let solape = 0;
    for (const f of filas) {
      const ultima = f.palabras[f.palabras.length - 1];
      // No se engancha a un renglón que ya tiene algo en ese mismo lugar.
      if (p.x0 < ultima.x1 - altoTipico * 0.3) continue;
      const [fa, fb] = f.banda;
      const s = (Math.min(b, fb) - Math.max(a, fa)) / Math.min(b - a, fb - fa);
      if (s > solape) {
        solape = s;
        mejor = f;
      }
    }
    if (mejor && solape >= 0.5) {
      mejor.palabras.push(p);
      mejor.banda = [a, b];
    } else {
      filas.push({ palabras: [p], banda: [a, b] });
    }
  }
  const lista = filas
    .map((f) => ({
      palabras: f.palabras,
      y: mediana(f.palabras.map(centro)),
      alto: mediana(f.palabras.map((p) => p.y1 - p.y0)) || altoTipico,
    }))
    .sort((a, b) => a.y - b.y);
  return unirPartidos(lista, altoTipico).map((r) => ({ ...r, palabras: corregirRenglon(r.palabras, altoTipico) }));
}

/**
 * Errores típicos del OCR en estas planillas:
 * - "Física |": la I romana sale como barra (si está pegada a una palabra);
 *   las otras barras son restos de bordes y se descartan;
 * - "ler." o "Ier." en vez de "1er.";
 * - letras O, o, l, I dentro de fechas y horas ("O7/12/2O26").
 */
function corregirRenglon(palabras: PalabraOcr[], altoTipico: number): PalabraOcr[] {
  const salida: PalabraOcr[] = [];
  for (const p of palabras) {
    const previa = salida[salida.length - 1];
    if (p.t === '|') {
      if (previa && /\p{L}$/u.test(previa.t) && p.x0 - previa.x1 < altoTipico) salida.push({ ...p, t: 'I' });
      continue;
    }
    let t = p.t;
    if (/^[lI]er\.?$/.test(t)) t = '1' + t.slice(1);
    if (/^[\dOolI]{1,2}[/:.-][\dOolI]{1,2}([/.-][\dOolI]{2,4})?$/.test(t) && /\d/.test(t)) t = t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1');
    salida.push(t === p.t ? p : { ...p, t });
  }
  // "13/1 1/2027": una fecha partida en dos palabras.
  for (let i = 0; i + 1 < salida.length; i++) {
    const a = salida[i];
    const b = salida[i + 1];
    if (/^\d{1,2}\/\d$/.test(a.t) && /^\d\/\d{2,4}$/.test(b.t) && b.x0 - a.x1 < altoTipico * 0.6) {
      salida.splice(i, 2, { ...a, t: a.t + b.t, x1: b.x1, c: Math.min(a.c, b.c) });
    }
  }
  return salida;
}

/**
 * En las tablas escaneadas, una celda de dos renglones o centrada en vertical
 * deja su texto un poco más arriba o más abajo que el resto de la fila. Si dos
 * renglones vecinos no se pisan en horizontal (cada uno ocupa otras columnas),
 * son la misma fila de la tabla y se unen.
 */
function unirPartidos(lista: RenglonOcr[], altoTipico: number): RenglonOcr[] {
  const margen = altoTipico * 0.5;
  const sePisan = (a: RenglonOcr, b: RenglonOcr) =>
    a.palabras.some((p) => b.palabras.some((q) => p.x0 < q.x1 + margen && q.x0 < p.x1 + margen));
  const salida: RenglonOcr[] = [];
  for (const r of lista) {
    const previo = salida[salida.length - 1];
    if (previo && r.y - previo.y < altoTipico * 1.6 && !sePisan(previo, r)) {
      const palabras = [...previo.palabras, ...r.palabras].sort((a, b) => a.x0 - b.x0);
      salida[salida.length - 1] = { palabras, y: (previo.y + r.y) / 2, alto: Math.max(previo.alto, r.alto) };
    } else {
      salida.push(r);
    }
  }
  return salida;
}

/** Un trozo de texto de un renglón, separado del resto por un hueco ancho (una celda). */
export interface Celda {
  texto: string;
  x0: number;
  x1: number;
}

/** Renglón de un documento (escaneado o con texto), con sus celdas de izquierda a derecha. */
export interface FilaDoc {
  pagina: number;
  celdas: Celda[];
  /** Centro vertical (crece hacia abajo) y alto de letra, para saber qué renglones están pegados. */
  y?: number;
  alto?: number;
}

/** Celdas de un renglón: palabras con un espacio; un hueco de más de 1,4 letras separa celdas. */
export function celdasDeRenglon(r: RenglonOcr): Celda[] {
  const celdas: Celda[] = [];
  for (const p of r.palabras) {
    const ultima = celdas[celdas.length - 1];
    if (ultima && p.x0 - ultima.x1 <= r.alto * 1.4) {
      ultima.texto += ' ' + p.t;
      ultima.x1 = p.x1;
    } else {
      celdas.push({ texto: p.t, x0: p.x0, x1: p.x1 });
    }
  }
  return celdas;
}

export function filasDeOcr(paginas: PaginaOcr[]): FilaDoc[] {
  return paginas.flatMap((p, i) => renglones(p).map((r) => ({ pagina: i, celdas: celdasDeRenglon(r), y: r.y, alto: r.alto })));
}

/** Texto de las filas: celdas separadas por tres espacios y una línea vacía entre páginas. */
export function textoDeFilas(filas: FilaDoc[]): string {
  let s = '';
  let pagina = filas[0]?.pagina ?? 0;
  for (const f of filas) {
    if (f.pagina !== pagina) {
      s += '\n';
      pagina = f.pagina;
    }
    s += f.celdas.map((c) => c.texto).join('   ') + '\n';
  }
  return s.trimEnd();
}

/** Texto del documento: un renglón por línea y una línea vacía entre páginas. */
export function textoDeOcr(paginas: PaginaOcr[]): string {
  return textoDeFilas(filasDeOcr(paginas));
}

/** Confianza media de las palabras (0–100), para avisar si el escaneo es malo. */
export function confianzaMedia(paginas: PaginaOcr[]): number {
  const todas = paginas.flatMap((p) => p.palabras);
  if (!todas.length) return 0;
  return Math.round(todas.reduce((a, p) => a + p.c, 0) / todas.length);
}
