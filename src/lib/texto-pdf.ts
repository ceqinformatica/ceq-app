/**
 * Saca el texto de un PDF simple sin comprimir, como el extracto del EALU
 * (generado con jsPDF). Arma una línea por cada altura de la página y separa
 * las columnas con tres espacios, que es lo que espera leerExtracto.
 *
 * No intenta leer cualquier PDF: si el contenido viene comprimido o no hay
 * texto, devuelve '' y la pantalla le pide al estudiante otro archivo.
 * No usa red ni guarda nada: el PDF se procesa en el teléfono.
 */

interface Trozo {
  x: number;
  y: number;
  texto: string;
}

/** Bytes del PDF como texto latin1 (WinAnsi coincide en tildes y eñes). */
function latin1(bytes: Uint8Array): string {
  let s = '';
  const paso = 0x2000; // bloques chicos: seguro en Hermes
  for (let i = 0; i < bytes.length; i += paso) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + paso)));
  }
  return s;
}

/** Desescapa una cadena literal de PDF: \( \) \\ \n \t \ddd. */
function cadenaPdf(cruda: string): string {
  return cruda.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, e: string) => {
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
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return ''; // salto de línea escapado: continúa la cadena
  });
}

/** Trozos de texto de un flujo de contenido, con su posición. */
function trozosDeFlujo(flujo: string): Trozo[] {
  const trozos: Trozo[] = [];
  // Números, cadenas (con paréntesis escapados) y operadores.
  const token = /\((?:\\[\s\S]|[^\\)])*\)|\[(?:\((?:\\[\s\S]|[^\\)])*\)|[^\](])*\]|-?\d*\.?\d+|[A-Za-z'"*]+|\/[^\s/[\]()<>]+/g;
  let pila: string[] = [];
  let x = 0;
  let y = 0;
  let inicioX = 0;
  let inicioY = 0;
  let interlineado = 0;
  for (const m of flujo.matchAll(token)) {
    const t = m[0];
    if (/^[A-Za-z'"*]+$/.test(t)) {
      const n = pila.map(Number);
      switch (t) {
        case 'BT':
          x = y = inicioX = inicioY = 0;
          break;
        case 'Td':
        case 'TD':
          inicioX += n[n.length - 2] ?? 0;
          inicioY += n[n.length - 1] ?? 0;
          if (t === 'TD') interlineado = -(n[n.length - 1] ?? 0);
          x = inicioX;
          y = inicioY;
          break;
        case 'Tm':
          inicioX = x = n[n.length - 2] ?? 0;
          inicioY = y = n[n.length - 1] ?? 0;
          break;
        case 'TL':
          interlineado = n[n.length - 1] ?? 0;
          break;
        case 'T*':
          inicioY -= interlineado;
          x = inicioX;
          y = inicioY;
          break;
        case 'Tj':
        case "'":
        case '"':
        case 'TJ': {
          if (t !== 'Tj' && t !== 'TJ') {
            inicioY -= interlineado;
            x = inicioX;
            y = inicioY;
          }
          const arg = pila[pila.length - 1] ?? '';
          const partes = arg.startsWith('[')
            ? [...arg.matchAll(/\((?:\\[\s\S]|[^\\)])*\)/g)].map((p) => p[0])
            : [arg];
          const texto = partes
            .filter((p) => p.startsWith('('))
            .map((p) => cadenaPdf(p.slice(1, -1)))
            .join('');
          if (texto.trim()) trozos.push({ x, y, texto });
          break;
        }
      }
      pila = [];
    } else {
      pila.push(t);
    }
  }
  return trozos;
}

/** Junta los trozos en líneas, de arriba hacia abajo y de izquierda a derecha. */
function armarLineas(trozos: Trozo[]): string {
  const filas = new Map<number, Trozo[]>();
  for (const t of trozos) {
    // Misma línea si la altura coincide a medio punto.
    const clave = [...filas.keys()].find((k) => Math.abs(k - t.y) < 0.5) ?? t.y;
    const fila = filas.get(clave) ?? [];
    fila.push(t);
    filas.set(clave, fila);
  }
  return [...filas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, fila]) =>
      fila
        .sort((a, b) => a.x - b.x)
        .map((t) => t.texto.trim())
        .join('   '),
    )
    .join('\n');
}

/**
 * Texto de un PDF sin comprimir. Cada página va separada por una línea vacía.
 * Devuelve '' si no encuentra texto legible (por ejemplo, PDF comprimido o
 * escaneado).
 */
export function textoDePdf(bytes: Uint8Array): string {
  const pdf = latin1(bytes);
  if (!pdf.startsWith('%PDF')) return '';
  const paginas: string[] = [];
  // Diccionario del objeto (sin cruzar a otro objeto) y su flujo.
  const flujo = /obj\s*<<((?:(?!endobj)[\s\S])*?)>>\s*stream\r?\n([\s\S]*?)\r?\n?endstream/g;
  for (const m of pdf.matchAll(flujo)) {
    const dicc = m[1];
    if (/\/Filter|\/Subtype\s*\/Image/.test(dicc)) continue;
    const trozos = trozosDeFlujo(m[2]);
    if (trozos.length) paginas.push(armarLineas(trozos));
  }
  return paginas.join('\n\n');
}
