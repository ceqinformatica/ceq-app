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
  // Tramos horizontales largos (permitiendo cortes de 2 px por el escaneo).
  for (let y = 0; y < h; y++) {
    let inicio = -1, huecos = 0;
    for (let x = 0; x <= w; x++) {
      const n = x < w && negro[y * w + x];
      if (n) { if (inicio < 0) inicio = x; huecos = 0; }
      else if (inicio >= 0 && ++huecos > 2) {
        const fin = x - huecos;
        if (fin - inicio >= largoH) for (let k = inicio; k <= fin; k++) borrar[y * w + k] = 1;
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
        if (fin - inicio >= largoV) for (let k = inicio; k <= fin; k++) borrar[k * w + x] = 1;
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
      limpiar(ctx, lienzo.width, lienzo.height);
      const { data } = await worker.recognize(lienzo, {}, { blocks: true, text: false });
      const palabras = [];
      for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) {
        const t = (w.text || '').trim();
        if (!t) continue;
        palabras.push({ t, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, c: Math.round(w.confidence) });
      }
      paginas.push({ ancho: lienzo.width, alto: lienzo.height, palabras });
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
