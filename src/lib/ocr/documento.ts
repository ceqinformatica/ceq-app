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

/** Líneas de las tablas: horizontales [y, x0, x1] y verticales [x, y0, y1], en píxeles. */
export interface LineasOcr {
  h: [number, number, number][];
  v: [number, number, number][];
}

export interface PaginaOcr {
  ancho: number;
  alto: number;
  palabras: PalabraOcr[];
  /** Bordes de las tablas que se borraron antes de leer (si el lector los mandó). */
  lineas?: LineasOcr;
  /** Copia chica de la página (data:image/jpeg) para mostrar recortes. */
  imagen?: string;
}

export interface RenglonOcr {
  palabras: PalabraOcr[];
  /** Centro vertical y alto típico de letra del renglón. */
  y: number;
  alto: number;
  /** Celdas ya armadas con las líneas de la tabla (si el renglón es una fila de tabla). */
  celdas?: Celda[];
}

export interface OpcionesOcr {
  /**
   * Armar las filas con las líneas de las tablas (una fila = lo que queda
   * entre dos líneas). Sirve para planillas de una fila por renglón, como
   * los finales; en la grilla de horarios cada materia ocupa dos renglones
   * (De / A) y conviene leerla renglón por renglón.
   */
  tablas?: boolean;
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
export function renglones(pagina: PaginaOcr, opciones: OpcionesOcr = {}): RenglonOcr[] {
  const palabras = pagina.palabras.filter((p) => !esRuido(p) && p.y1 > p.y0 && p.x1 > p.x0);
  if (!palabras.length) return [];
  const altoTipico = mediana(palabras.map((p) => p.y1 - p.y0)) || 20;
  const { filas, sueltas } = opciones.tablas ? filasDeTabla(palabras, pagina.lineas, altoTipico) : { filas: [], sueltas: palabras };
  const libres = unirPartidos(agrupar(sueltas, altoTipico), altoTipico).map((r) => ({ ...r, palabras: corregirRenglon(r.palabras, altoTipico) }));
  return [...filas, ...libres].sort((a, b) => a.y - b.y);
}

/** Agrupa palabras en renglones por cómo se superponen en vertical (ver `renglones`). */
function agrupar(palabras: PalabraOcr[], altoTipico: number): RenglonOcr[] {
  if (!palabras.length) return [];
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
  return lista;
}

/** Texto de una celda de varios renglones: de arriba abajo y de izquierda a derecha. */
function textoDeCelda(palabras: PalabraOcr[], alto: number): string {
  // Mismo renglón si se superponen en vertical (una palabra con una mancha puede medir el doble).
  const lineas: { y0: number; y1: number; palabras: PalabraOcr[] }[] = [];
  const solape = (a0: number, a1: number, b0: number, b1: number) => (Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, Math.min(a1 - a0, b1 - b0));
  for (const p of [...palabras].sort((a, b) => a.y1 - a.y0 - (b.y1 - b.y0))) {
    const l = lineas.find((l) => solape(l.y0, l.y1, p.y0, p.y1) >= 0.4);
    if (l) l.palabras.push(p);
    else lineas.push({ y0: p.y0, y1: p.y1, palabras: [p] });
  }
  lineas.sort((a, b) => a.y0 + a.y1 - b.y0 - b.y1);
  void alto;
  return lineas.map((l) => l.palabras.sort((a, b) => a.x0 - b.x0).map((p) => p.t).join(' ')).join(' ');
}

interface LineaH {
  tramos: [number, number, number][];
  x0: number;
  x1: number;
}

/** Altura de una línea horizontal (algo torcida) a la altura de x. */
function yEn(l: LineaH, x: number): number {
  let mejor = l.tramos[0];
  let dist = Infinity;
  for (const t of l.tramos) {
    const d = x < t[1] ? t[1] - x : x > t[2] ? x - t[2] : 0;
    if (d < dist) {
      dist = d;
      mejor = t;
    }
  }
  return mejor[0];
}

/**
 * Con las líneas de la tabla, cada palabra cae entre una línea de arriba y
 * una de abajo: todas las que comparten ese par son la misma fila, aunque el
 * OCR las haya leído un poco corridas (celdas de dos renglones, centradas o
 * con la hoja torcida). Las líneas verticales separan las celdas. Lo que no
 * está dentro de una tabla vuelve en `sueltas`.
 */
function filasDeTabla(palabras: PalabraOcr[], lineas: LineasOcr | undefined, altoTipico: number): { filas: RenglonOcr[]; sueltas: PalabraOcr[] } {
  if (!lineas || lineas.h.length < 2) return { filas: [], sueltas: palabras };
  // Tramos de la misma línea (cortada por el escaneo) se juntan en una.
  const hs: LineaH[] = [];
  for (const t of [...lineas.h].sort((a, b) => a[1] - b[1])) {
    const l = hs.find((l) => Math.abs(yEn(l, t[1]) - t[0]) <= altoTipico * 0.4 && t[1] - l.x1 <= altoTipico * 3);
    if (l) {
      l.tramos.push(t);
      l.x1 = Math.max(l.x1, t[2]);
    } else {
      hs.push({ tramos: [t], x0: t[1], x1: t[2] });
    }
  }
  const grupos = new Map<string, { palabras: PalabraOcr[]; arriba: number; abajo: number }>();
  const sueltas: PalabraOcr[] = [];
  for (const p of palabras) {
    const cx = (p.x0 + p.x1) / 2;
    const cy = (p.y0 + p.y1) / 2;
    let arriba = -1;
    let abajo = -1;
    let ya = -Infinity;
    let yb = Infinity;
    hs.forEach((l, i) => {
      if (cx < l.x0 - altoTipico * 0.5 || cx > l.x1 + altoTipico * 0.5) return;
      const y = yEn(l, cx);
      if (y < cy && y > ya) {
        ya = y;
        arriba = i;
      } else if (y > cy && y < yb) {
        yb = y;
        abajo = i;
      }
    });
    // Una fila de tabla tiene a lo sumo tres renglones de letra.
    if (arriba < 0 || abajo < 0 || yb - ya > altoTipico * 4.5) {
      sueltas.push(p);
      continue;
    }
    const clave = arriba + ':' + abajo;
    const g = grupos.get(clave);
    if (g) g.palabras.push(p);
    else grupos.set(clave, { palabras: [p], arriba: ya, abajo: yb });
  }
  const filas: RenglonOcr[] = [];
  for (const g of grupos.values()) {
    const margen = altoTipico * 0.5;
    const x0 = Math.min(...g.palabras.map((p) => p.x0));
    const x1 = Math.max(...g.palabras.map((p) => p.x1));
    // Bordes verticales que cruzan toda la fila.
    const cortes = lineas.v
      .filter(([x, a, b]) => x > x0 - margen && x < x1 + margen && a <= g.arriba + margen && b >= g.abajo - margen)
      .map(([x]) => x)
      .sort((a, b) => a - b);
    const columna = (p: PalabraOcr) => {
      const cx = (p.x0 + p.x1) / 2;
      let n = 0;
      while (n < cortes.length && cortes[n] < cx) n++;
      return n;
    };
    const sub = agrupar(g.palabras, altoTipico).map((r) => corregirRenglon(r.palabras, altoTipico));
    const todas = sub.flat();
    const alto = mediana(todas.map((p) => p.y1 - p.y0)) || altoTipico;
    // Por columna, las palabras pegadas (en el mismo renglón o una debajo de otra) son una celda.
    const grupos: { col: number; palabras: PalabraOcr[]; x0: number; x1: number }[] = [];
    for (const p of [...todas].sort((a, b) => a.x0 - b.x0)) {
      const col = columna(p);
      const c = grupos.find((c) => c.col === col && p.x0 - c.x1 <= alto * 1.4 && p.x1 >= c.x0 - alto * 1.4);
      if (c) {
        c.palabras.push(p);
        c.x1 = Math.max(c.x1, p.x1);
      } else {
        grupos.push({ col, palabras: [p], x0: p.x0, x1: p.x1 });
      }
    }
    const celdas: Celda[] = grupos.map((c) => ({ texto: textoDeCelda(c.palabras, alto), x0: c.x0, x1: c.x1 }));
    celdas.sort((a, b) => a.x0 - b.x0);
    filas.push({
      palabras: todas.sort((a, b) => a.x0 - b.x0),
      y: mediana(g.palabras.map((p) => (p.y0 + p.y1) / 2)),
      alto,
      celdas,
    });
  }
  return { filas, sueltas };
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
  /** Rectángulo que ocupa el renglón en la página (solo en PDF escaneados). */
  zona?: Zona;
}

/** Lugar de la página donde está algo, para mostrar el recorte del PDF. */
export interface Zona {
  pagina: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Alto de letra, para ampliar el recorte hasta que se lea. */
  alto: number;
}

/** Une dos zonas de la misma página (la de otra página no se suma). */
export function unirZonas(a: Zona | null | undefined, b: Zona | null | undefined): Zona | null {
  if (!a) return b ?? null;
  if (!b || b.pagina !== a.pagina) return a;
  return { pagina: a.pagina, x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), alto: Math.max(a.alto, b.alto) };
}

/** Texto de un renglón tal como queda en `textoDeFilas`. */
export const textoDeFila = (f: FilaDoc) => f.celdas.map((c) => c.texto).join('   ');

const fichasDe = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9:]+/)
    .map((w) => w.replace(/^:+|:+$/g, ''))
    .filter((w) => w.length >= 2);

/**
 * Dónde está un texto en el documento: el renglón idéntico, o el que más
 * palabras comparte con él (y los vecinos que también las tienen, para un
 * texto que ocupa varios renglones). null si no hay zonas (PDF con texto).
 */
export function ubicar(filas: FilaDoc[], texto: string, pagina?: number | null): Zona | null {
  const buscado = texto.trim();
  if (!buscado) return null;
  const candidatas = filas.filter((f) => f.zona && (pagina == null || f.pagina === pagina));
  const igual = candidatas.find((f) => textoDeFila(f).trim() === buscado);
  if (igual) return igual.zona!;
  const quiero = new Set(fichasDe(buscado));
  if (!quiero.size) return null;
  const puntos = candidatas.map((f) => {
    const tiene = new Set(fichasDe(textoDeFila(f)));
    let n = 0;
    for (const w of tiene) if (quiero.has(w)) n++;
    return n / Math.max(3, Math.min(quiero.size, tiene.size));
  });
  let mejor = -1;
  puntos.forEach((p, i) => {
    if (p > (puntos[mejor] ?? 0)) mejor = i;
  });
  if (mejor < 0 || puntos[mejor] < 0.4) return null;
  let zona = candidatas[mejor].zona!;
  // Renglones vecinos (misma página, pegados) que también comparten palabras.
  for (const paso of [-1, 1]) {
    for (let i = mejor + paso; i >= 0 && i < candidatas.length; i += paso) {
      const f = candidatas[i];
      if (f.pagina !== zona.pagina || puntos[i] < 0.3 || Math.abs(f.zona!.y0 - zona.y0) > zona.alto * 8) break;
      zona = unirZonas(zona, f.zona)!;
    }
  }
  return zona;
}

/** Celdas de un renglón: palabras con un espacio; un hueco de más de 1,4 letras separa celdas. */
export function celdasDeRenglon(r: RenglonOcr): Celda[] {
  if (r.celdas) return r.celdas.map((c) => ({ ...c }));
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

export function filasDeOcr(paginas: PaginaOcr[], opciones: OpcionesOcr = {}): FilaDoc[] {
  return paginas.flatMap((p, i) =>
    renglones(p, opciones).map((r) => ({
      pagina: i,
      celdas: celdasDeRenglon(r),
      y: r.y,
      alto: r.alto,
      zona: {
        pagina: i,
        x0: Math.min(...r.palabras.map((w) => w.x0)),
        y0: Math.min(...r.palabras.map((w) => w.y0)),
        x1: Math.max(...r.palabras.map((w) => w.x1)),
        y1: Math.max(...r.palabras.map((w) => w.y1)),
        alto: r.alto,
      },
    })),
  );
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
export function textoDeOcr(paginas: PaginaOcr[], opciones: OpcionesOcr = {}): string {
  return textoDeFilas(filasDeOcr(paginas, opciones));
}

/** Confianza media de las palabras (0–100), para avisar si el escaneo es malo. */
export function confianzaMedia(paginas: PaginaOcr[]): number {
  const todas = paginas.flatMap((p) => p.palabras);
  if (!todas.length) return 0;
  return Math.round(todas.reduce((a, p) => a + p.c, 0) / todas.length);
}
