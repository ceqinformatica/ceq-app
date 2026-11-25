/**
 * Enlace del correo para recuperar el PIN (ceqapp://auth/pin?code=...).
 *
 * El enlace puede llegar con la app desbloqueada (ruta auth/pin), bloqueada
 * (el bloqueo tapa las rutas) o justo cuando la app se bloquea al volver del
 * correo. Por eso el canje no depende de ninguna pantalla: se hace acá, una
 * sola vez por código, y el resultado queda guardado hasta que lo tome la
 * pantalla de "¿Olvidaste tu PIN?" (la del bloqueo o la de Perfil), aunque se
 * monte después. El resultado vence a los 15 minutos y se olvida al salir.
 * Sin React Native, para probarlo con node --test.
 */

export type EnlacePin = { code: string; flowId: string | null } | { error: string };
export type ResultadoPin = { tipo: 'canjeando' } | { tipo: 'confirmado' } | { tipo: 'error'; mensaje: string };

const VIGENCIA_MS = 15 * 60_000;

/** Lo que trae un enlace de recuperar PIN, o null si la dirección es otra. */
export function leerEnlacePin(url: string | null | undefined): EnlacePin | null {
  if (!url || !/auth\/pin(?:[/?#]|$)/.test(url)) return null;
  const param = (nombre: string) => {
    const m = new RegExp(`[?&#]${nombre}=([^&#]*)`).exec(url);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  };
  const code = param('code');
  if (code) return { code, flowId: param('sb_flow_id') };
  return { error: param('error_description') ?? param('error') ?? 'El enlace no es válido.' };
}

let actual: { r: ResultadoPin; desde: number } | null = null;
const oyentes = new Set<() => void>();
const vistos = new Set<string>();

function fijar(r: ResultadoPin | null, ahora = Date.now()) {
  actual = r ? { r, desde: ahora } : null;
  oyentes.forEach((f) => f());
}

/**
 * Procesa un enlace recibido. Cada código se canjea una sola vez (puede
 * llegar por dos caminos); un enlace con error siempre se avisa.
 * `canjear` devuelve null si el enlace es de la cuenta de la sesión, o el error.
 */
export async function procesarEnlacePin(e: EnlacePin, canjear: (code: string, flowId: string | null) => Promise<string | null>) {
  if ('error' in e) {
    fijar({ tipo: 'error', mensaje: 'El enlace venció o ya se usó. Pedí uno nuevo.' });
    return;
  }
  if (vistos.has(e.code)) return;
  vistos.add(e.code);
  fijar({ tipo: 'canjeando' });
  const r = await canjear(e.code, e.flowId).catch(() => 'No se pudo confirmar. Probá de nuevo.');
  fijar(r === null ? { tipo: 'confirmado' } : { tipo: 'error', mensaje: r });
}

/** El resultado del último enlace (si no venció), sin tomarlo. */
export function resultadoPin(ahora = Date.now()): ResultadoPin | null {
  if (actual && ahora - actual.desde > VIGENCIA_MS && actual.r.tipo !== 'canjeando') actual = null;
  return actual?.r ?? null;
}

/** Toma el resultado final (confirmado o error) para usarlo una sola vez. */
export function tomarResultadoPin(ahora = Date.now()): ResultadoPin | null {
  const r = resultadoPin(ahora);
  if (!r || r.tipo === 'canjeando') return r;
  actual = null;
  return r;
}

/** Avisa cada vez que cambia el resultado. */
export function escucharResultadoPin(f: () => void): () => void {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

let pantallas = 0;
/** "¿Olvidaste tu PIN?" está abierta (y tomará el resultado). Devuelve cómo avisar que se cerró. */
export function abrirPantallaPin(): () => void {
  pantallas++;
  return () => {
    pantallas--;
  };
}
export const hayPantallaPin = () => pantallas > 0;

/** Al cerrar sesión: un resultado guardado no sirve para la próxima cuenta. */
export function olvidarEnlacePin() {
  fijar(null);
}

/** Solo para las pruebas. */
export function reiniciarEnlacePin() {
  actual = null;
  oyentes.clear();
  vistos.clear();
  pantallas = 0;
}
