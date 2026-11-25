/**
 * Enlace del correo para recuperar el PIN (ceqapp://auth/pin?code=...).
 * El enlace puede llegar por la ruta auth/pin (app desbloqueada) o directo
 * al bloqueo (que tapa las rutas): los dos lo entregan acá y lo recibe la
 * pantalla que está esperando, una sola vez por código. Si todavía no hay
 * nadie esperando (la app recién se abre), queda guardado hasta que llegue.
 * Sin React Native, para probarlo con node --test.
 */

export type EnlacePin = { code: string } | { error: string };

/** Lo que trae un enlace de recuperar PIN, o null si la dirección es otra. */
export function leerEnlacePin(url: string | null | undefined): EnlacePin | null {
  if (!url || !/auth\/pin(?:[/?#]|$)/.test(url)) return null;
  const param = (nombre: string) => {
    const m = new RegExp(`[?&#]${nombre}=([^&#]*)`).exec(url);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  };
  const code = param('code');
  if (code) return { code };
  const error = param('error_description') ?? param('error');
  return { error: error ?? 'El enlace no es válido.' };
}

let pendiente: EnlacePin | null = null;
const oyentes = new Set<(e: EnlacePin) => void>();
const vistos = new Set<string>();

/** Entrega un enlace recibido. Cada código se entrega una sola vez. */
export function entregarEnlacePin(e: EnlacePin) {
  const clave = 'code' in e ? `c:${e.code}` : `e:${e.error}`;
  if (vistos.has(clave)) return;
  vistos.add(clave);
  if (oyentes.size) oyentes.forEach((f) => f(e));
  else pendiente = e;
}

/** Escucha los enlaces que lleguen (y recibe enseguida el que estaba guardado). */
export function escucharEnlacePin(f: (e: EnlacePin) => void): () => void {
  oyentes.add(f);
  if (pendiente) {
    const e = pendiente;
    pendiente = null;
    f(e);
  }
  return () => {
    oyentes.delete(f);
  };
}

/** ¿Hay un enlace esperando a que se abra "¿Olvidaste tu PIN?"? */
export const hayEnlacePinPendiente = () => pendiente != null;

/** Solo para las pruebas. */
export function reiniciarEnlacePin() {
  pendiente = null;
  oyentes.clear();
  vistos.clear();
}
