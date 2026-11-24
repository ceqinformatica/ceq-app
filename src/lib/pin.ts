/**
 * PIN de la app: reglas puras (sin almacenamiento), para poder probarlas.
 *
 * El PIN nunca se guarda tal cual: se guarda un resumen SHA-256 con sal,
 * repetido muchas veces, dentro del almacenamiento cifrado del celular.
 * La protección principal contra probar PIN al azar es el límite de intentos.
 */

export const PIN_MIN = 4;
export const PIN_MAX = 6;
/** Intentos fallidos libres antes de tener que esperar. */
export const FALLOS_LIBRES = 5;
/** Con esta cantidad de fallos seguidos se cierra la sesión (se vuelve a entrar con Google). */
export const FALLOS_MAXIMOS = 10;
export const ITERACIONES = 1000;

export interface PinGuardado {
  v: 1;
  largo: number;
  sal: string;
  iter: number;
  resumen: string;
}

/** null si el PIN sirve; si no, el motivo para mostrar. */
export function problemaPin(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return 'El PIN solo lleva números.';
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) return `El PIN tiene que tener entre ${PIN_MIN} y ${PIN_MAX} números.`;
  if (/^(\d)\1+$/.test(pin)) return 'Elegí un PIN menos obvio que repetir el mismo número.';
  const pasos = new Set<number>();
  for (let i = 1; i < pin.length; i++) pasos.add((Number(pin[i]) - Number(pin[i - 1]) + 10) % 10);
  if (pasos.size === 1 && (pasos.has(1) || pasos.has(9))) return 'Elegí un PIN menos obvio que una escalera de números.';
  return null;
}

/** Segundos que hay que esperar después de `fallos` intentos fallidos seguidos. */
export function esperaTrasFallos(fallos: number): number {
  if (fallos < FALLOS_LIBRES) return 0;
  return Math.min(30 * 2 ** (fallos - FALLOS_LIBRES), 15 * 60);
}

/** Cuántos segundos faltan para poder volver a probar (0 = ya se puede). */
export function segundosRestantes(fallos: number, ultimoFallo: number | null, ahora: number): number {
  if (!ultimoFallo) return 0;
  const fin = ultimoFallo + esperaTrasFallos(fallos) * 1000;
  return Math.max(0, Math.ceil((fin - ahora) / 1000));
}

export function crearRegistroPin(pin: string, sal: string, iter = ITERACIONES): PinGuardado {
  return { v: 1, largo: pin.length, sal, iter, resumen: resumirPin(pin, sal, iter) };
}

export function pinCoincide(pin: string, guardado: PinGuardado): boolean {
  const otro = resumirPin(pin, guardado.sal, guardado.iter);
  // Comparación de tiempo constante.
  let dif = otro.length ^ guardado.resumen.length;
  for (let i = 0; i < Math.min(otro.length, guardado.resumen.length); i++) dif |= otro.charCodeAt(i) ^ guardado.resumen.charCodeAt(i);
  return dif === 0;
}

export function resumirPin(pin: string, sal: string, iter: number): string {
  let h = sha256(`${sal}:${pin}`);
  for (let i = 1; i < iter; i++) h = sha256(`${h}${sal}${pin}`);
  return h;
}

/** Sal aleatoria en hexadecimal. */
export function nuevaSal(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(arr);
  else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function leerPinGuardado(texto: string | null): PinGuardado | null {
  if (!texto) return null;
  try {
    const p = JSON.parse(texto) as Partial<PinGuardado>;
    if (p.v === 1 && typeof p.sal === 'string' && typeof p.resumen === 'string' && typeof p.iter === 'number' && typeof p.largo === 'number') return p as PinGuardado;
  } catch {
    // dato roto: como si no hubiera PIN
  }
  return null;
}

// --- SHA-256 (FIPS 180-4), en JS puro para no sumar módulos nativos ---

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8(texto: string): number[] {
  const out: number[] = [];
  for (const ch of texto) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      c = 0;
    }
  }
  return out;
}

export function sha256(texto: string): string {
  const bytes = utf8(texto);
  const bits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const alto = Math.floor(bits / 2 ** 32);
  for (const n of [alto, bits >>> 0]) bytes.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = (bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) | (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3];
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('');
}
