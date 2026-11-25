/**
 * Página que lee un PDF escaneado con OCR. Corre dentro de una WebView
 * oculta en el celular, o de un iframe oculto en la web: así el mismo código
 * sirve en los dos lados.
 *
 * - pdf.js dibuja cada página del PDF en un lienzo, a unos 250 ppp.
 * - Tesseract (el OCR libre de Google) reconoce las palabras en español y
 *   devuelve cada una con su rectángulo, para rearmar renglones y columnas.
 *
 * Es gratis y no usa claves: las bibliotecas y el idioma se descargan de
 * jsDelivr la primera vez (unos 8 MB) y después quedan en caché. El PDF no
 * sale del dispositivo.
 *
 * Mensajes (todos JSON):
 *   app → página: { tipo: 'pdf', base64 } | { tipo: 'trozo', base64 } … { tipo: 'leer' }
 *   página → app: { tipo: 'lista' } | { tipo: 'progreso', ... } | { tipo: 'resultado', paginas } | { tipo: 'error', mensaje }
 */

const CDN = 'https://cdn.jsdelivr.net/npm';
export const VERSIONES_OCR = {
  pdfjs: '4.10.38',
  tesseract: '6.0.1',
  core: '6.0.0',
  idioma: '1.0.0',
};
const V = VERSIONES_OCR;

export const URLS_OCR = {
  // Versión "legacy": trae sus propios rellenos (Promise.withResolvers y otros)
  // para los navegadores y WebView de Android que todavía no los tienen.
  pdfjs: `${CDN}/pdfjs-dist@${V.pdfjs}/legacy/build/pdf.min.mjs`,
  pdfjsWorker: `${CDN}/pdfjs-dist@${V.pdfjs}/legacy/build/pdf.worker.min.mjs`,
  tesseract: `${CDN}/tesseract.js@${V.tesseract}/dist/tesseract.min.js`,
  tesseractWorker: `${CDN}/tesseract.js@${V.tesseract}/dist/worker.min.js`,
  core: `${CDN}/tesseract.js-core@${V.core}`,
  idioma: `${CDN}/@tesseract.js-data/spa@${V.idioma}/4.0.0_best_int`,
};

/** Lado más largo de la página dibujada, en píxeles (≈ 250 ppp en A4). */
const LADO_MAXIMO = 2900;
/** Ancho de la copia de cada página que se guarda para mostrar recortes. */
const ANCHO_MINIATURA = 1400;

export const HTML_OCR = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<script>
// Navegadores viejos: pdf.js usa Promise.withResolvers (Chrome 119+).
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () { let resolve, reject; const promise = new this((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
}
</script>
<script src="${URLS_OCR.tesseract}"></script>
</head><body>
<script type="module">
const enviar = (m) => {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m));
  else window.parent.postMessage({ ocrCeq: m }, '*');
};
window.onerror = (msg) => enviar({ tipo: 'error', mensaje: String(msg) });

let pdfjs = null;
let partes = [];
const origenOpaco = (() => { try { return location.origin === 'null' || !window.indexedDB; } catch (e) { return true; } })();
const PSM = new URLSearchParams(location.search).get('psm') || '11';

async function cargarPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('${URLS_OCR.pdfjs}');
  pdfjs.GlobalWorkerOptions.workerSrc = '${URLS_OCR.pdfjsWorker}';
  return pdfjs;
}

function aBytes(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/**
 * Deja la página en blanco y negro y borra las líneas de las tablas: con
 * los bordes de las celdas, Tesseract confunde la tabla con una imagen y se
 * saltea el texto de adentro.
 */
function limpiar(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gris = new Uint8Array(w * h);
  let suma = 0;
  for (let i = 0, j = 0; j < gris.length; i += 4, j++) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    gris[j] = g;
    suma += g;
  }
  // Umbral: un poco por debajo del gris medio del papel.
  const umbral = Math.min(170, (suma / gris.length) * 0.72);
  const negro = new Uint8Array(w * h);
  for (let j = 0; j < gris.length; j++) negro[j] = gris[j] < umbral ? 1 : 0;
  const borrar = new Uint8Array(w * h);
  const largoH = Math.max(40, Math.round(w / 22));
  const largoV = Math.max(40, Math.round(h / 30));
  // Las líneas de la tabla se guardan (juntando los tramos de 1 px de grosor
  // vecinos) para rearmar las filas y celdas después.
  const lineasH = [], lineasV = [];
  const sumar = (lista, pos, a, b) => {
    for (let i = lista.length - 1; i >= 0 && i >= lista.length - 40; i--) {
      const l = lista[i];
      if (pos - l[3] <= 3 && a < l[2] && l[1] < b) { l[1] = Math.min(l[1], a); l[2] = Math.max(l[2], b); l[3] = pos; return; }
    }
    lista.push([pos, a, b, pos]);
  };
  // Tramos horizontales largos (permitiendo cortes de 2 px por el escaneo).
  for (let y = 0; y < h; y++) {
    let inicio = -1, huecos = 0;
    for (let x = 0; x <= w; x++) {
      const n = x < w && negro[y * w + x];
      if (n) { if (inicio < 0) inicio = x; huecos = 0; }
      else if (inicio >= 0 && ++huecos > 2) {
        const fin = x - huecos;
        if (fin - inicio >= largoH) { for (let k = inicio; k <= fin; k++) borrar[y * w + k] = 1; sumar(lineasH, y, inicio, fin); }
        inicio = -1; huecos = 0;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let inicio = -1, huecos = 0;
    for (let y = 0; y <= h; y++) {
      const n = y < h && negro[y * w + x];
      if (n) { if (inicio < 0) inicio = y; huecos = 0; }
      else if (inicio >= 0 && ++huecos > 2) {
        const fin = y - huecos;
        if (fin - inicio >= largoV) { for (let k = inicio; k <= fin; k++) borrar[k * w + x] = 1; sumar(lineasV, x, inicio, fin); }
        inicio = -1; huecos = 0;
      }
    }
  }
  for (let i = 0, j = 0; j < gris.length; i += 4, j++) {
    // Fondo de celda gris o color de sello: se aclara; la tinta queda negra.
    const v = borrar[j] ? 255 : gris[j] < umbral ? Math.max(0, gris[j] - 40) : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // [posición media, desde, hasta]; con 2000 de cada una alcanza para cualquier planilla.
  const medio = (l) => [Math.round((l[0] + l[3]) / 2), l[1], l[2]];
  return { h: lineasH.slice(0, 2000).map(medio), v: lineasV.slice(0, 2000).map(medio) };
}

/** Copia chica de la página (JPEG) para mostrar en el panel lo que no se pudo leer. */
function miniatura(lienzo) {
  try {
    const ancho = Math.min(${ANCHO_MINIATURA}, lienzo.width);
    const c = document.createElement('canvas');
    c.width = ancho;
    c.height = Math.round((lienzo.height * ancho) / lienzo.width);
    c.getContext('2d').drawImage(lienzo, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.6);
    c.width = c.height = 0;
    return url.startsWith('data:image/jpeg') ? url : undefined;
  } catch (e) {
    return undefined;
  }
}

function palabrasDe(data, dx, dy) {
  const salida = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) {
    const t = (w.text || '').trim();
    if (!t) continue;
    salida.push({ t, x0: w.bbox.x0 + dx, y0: w.bbox.y0 + dy, x1: w.bbox.x1 + dx, y1: w.bbox.y1 + dy, c: Math.round(w.confidence) });
  }
  return salida;
}

/**
 * Segunda pasada: busca manchas de tinta con forma de texto que el OCR no
 * leyó (números sueltos en una celda, como el "9" del nivel, o una hora
 * aislada) y las lee de nuevo, recortadas, como un solo renglón.
 */
async function rescatar(ctx, w, h, palabras, worker) {
  const alturas = palabras.map((p) => p.y1 - p.y0).sort((a, b) => a - b);
  const alto = alturas[Math.floor(alturas.length / 2)] || 30;
  const K = 4;
  const gw = Math.ceil(w / K), gh = Math.ceil(h / K);
  const d = ctx.getImageData(0, 0, w, h).data;
  const tinta = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4] < 110) tinta[((y / K) | 0) * gw + ((x / K) | 0)] = 1;
  // Lo que ya se leyó no cuenta.
  for (const p of palabras) {
    for (let y = Math.max(0, ((p.y0 - 4) / K) | 0); y <= Math.min(gh - 1, ((p.y1 + 4) / K) | 0); y++)
      for (let x = Math.max(0, ((p.x0 - 4) / K) | 0); x <= Math.min(gw - 1, ((p.x1 + 4) / K) | 0); x++) tinta[y * gw + x] = 0;
  }
  // Manchas conectadas (en la grilla reducida, con un salto de 1 celda).
  const vista = new Uint8Array(gw * gh);
  const manchas = [];
  const pila = [];
  for (let i = 0; i < tinta.length; i++) {
    if (!tinta[i] || vista[i]) continue;
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0, n = 0;
    pila.push(i); vista[i] = 1;
    while (pila.length) {
      const j = pila.pop();
      const x = j % gw, y = (j / gw) | 0;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(gh - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 2); xx <= Math.min(gw - 1, x + 2); xx++) {
          const k = yy * gw + xx;
          if (tinta[k] && !vista[k]) { vista[k] = 1; pila.push(k); }
        }
    }
    const ancho = (x1 - x0 + 1) * K, altura = (y1 - y0 + 1) * K;
    // Del alto de una letra, no más largo que una hora o una palabra, y con tinta suficiente.
    if (altura < alto * 0.55 || altura > alto * 2.2 || ancho > alto * 14 || n < 4) continue;
    manchas.push({ x0: x0 * K, y0: y0 * K, x1: (x1 + 1) * K, y1: (y1 + 1) * K });
    if (manchas.length >= 60) break;
  }
  if (!manchas.length) return;
  await worker.setParameters({ tessedit_pageseg_mode: '7' });
  try {
    for (const m of manchas) {
      const margen = Math.round(alto * 0.6);
      const ax = Math.max(0, m.x0 - margen), ay = Math.max(0, m.y0 - margen);
      const bw = Math.min(w, m.x1 + margen) - ax, bh = Math.min(h, m.y1 + margen) - ay;
      const c = document.createElement('canvas');
      c.width = bw; c.height = bh;
      c.getContext('2d').drawImage(ctx.canvas, ax, ay, bw, bh, 0, 0, bw, bh);
      const { data } = await worker.recognize(c, {}, { blocks: true, text: false });
      for (const p of palabrasDe(data, ax, ay)) if (p.c >= 45 && /[\\p{L}\\p{N}]/u.test(p.t)) palabras.push(p);
      c.width = c.height = 0;
    }
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: PSM });
  }
}

async function leer(bytes) {
  let worker = null;
  try {
    enviar({ tipo: 'progreso', fase: 'preparando', pagina: 0, paginas: 0 });
    const lib = await cargarPdfjs();
    const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    const total = Math.min(doc.numPages, 30);
    if (typeof Tesseract === 'undefined') throw new Error('No se pudo descargar el lector de texto. Revisá la conexión.');
    worker = await Tesseract.createWorker('spa', 1, {
      workerPath: '${URLS_OCR.tesseractWorker}',
      corePath: '${URLS_OCR.core}',
      langPath: '${URLS_OCR.idioma}',
      workerBlobURL: true,
      // En el iframe aislado de la web no hay IndexedDB: sin caché del idioma.
      cacheMethod: origenOpaco ? 'none' : 'write',
    });
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: PSM });
    const paginas = [];
    for (let n = 1; n <= total; n++) {
      enviar({ tipo: 'progreso', fase: 'leyendo', pagina: n, paginas: total });
      const pag = await doc.getPage(n);
      const base = pag.getViewport({ scale: 1 });
      const escala = Math.min(4, ${LADO_MAXIMO} / Math.max(base.width, base.height));
      const vista = pag.getViewport({ scale: escala });
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.ceil(vista.width);
      lienzo.height = Math.ceil(vista.height);
      const ctx = lienzo.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      await pag.render({ canvasContext: ctx, viewport: vista }).promise;
      const imagen = miniatura(lienzo);
      const lineas = limpiar(ctx, lienzo.width, lienzo.height);
      const { data } = await worker.recognize(lienzo, {}, { blocks: true, text: false });
      const palabras = palabrasDe(data, 0, 0);
      await rescatar(ctx, lienzo.width, lienzo.height, palabras, worker);
      paginas.push({ ancho: lienzo.width, alto: lienzo.height, palabras, lineas, imagen });
      lienzo.width = lienzo.height = 0;
      pag.cleanup();
    }
    enviar({ tipo: 'resultado', paginas, total: doc.numPages });
  } catch (e) {
    enviar({ tipo: 'error', mensaje: (e && e.message) || String(e) });
  } finally {
    if (worker) worker.terminate().catch(() => {});
  }
}

window.recibirOcr = (m) => {
  if (m.tipo === 'pdf') partes = [];
  if (m.tipo === 'pdf' || m.tipo === 'trozo') partes.push(m.base64);
  if (m.tipo === 'bytes') { leer(m.bytes); return; }
  if (m.tipo === 'leer') { const b = aBytes(partes.join('')); partes = []; leer(b); }
};
window.addEventListener('message', (e) => { if (e.source === window.parent && e.data && e.data.ocrCeqApp) window.recibirOcr(e.data.ocrCeqApp); });
enviar({ tipo: 'lista' });
</script>
</body></html>`;
