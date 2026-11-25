import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { clavesPin, crearRegistroPin, FALLOS_LIBRES, FALLOS_MAXIMOS, leerPinGuardado, nuevaSal, pinCoincide, problemaPin, segundosRestantes, type PinGuardado } from './pin';

/**
 * PIN de la app guardado en este dispositivo (cifrado por el sistema).
 * Sirve donde no hay huella (por ejemplo una tablet) o como respaldo de la huella.
 */
/**
 * El PIN es de cada cuenta en este dispositivo y NO se borra al cerrar sesión:
 * si se borrara, cualquiera con el celular en la mano podría tocar "Cerrar
 * sesión" en el bloqueo, volver a entrar con la cuenta de Google que ya está
 * en el celular y quedar adentro sin PIN. Se borra solo al quitarlo, al
 * eliminar la cuenta o al elegir uno nuevo tras confirmar la cuenta.
 */
const LEGADO = 'ceq_pin';
const LEGADO_INTENTOS = 'ceq_pin_intentos';
let cuenta: string | null = null;

/** La cuenta con sesión en este momento (la fija SesionProvider). Sin cuenta no hay PIN. */
export function fijarCuentaPin(uid: string | null) {
  cuenta = uid;
}

const claves = () => {
  const c = clavesPin(cuenta);
  if (!c) throw new Error('sin-cuenta');
  return c;
};

const almacen = {
  get: (k: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.setItem(k, v)) : SecureStore.setItemAsync(k, v)),
  borrar: (k: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.removeItem(k)) : SecureStore.deleteItemAsync(k)),
};

interface Intentos { fallos: number; ultimo: number | null }

/** El PIN guardado antes de que fuera por cuenta pasa a la primera cuenta que entra. */
async function migrarLegado(c: { pin: string; intentos: string }) {
  const viejo = await almacen.get(LEGADO).catch(() => null);
  if (!viejo) return;
  if (!(await almacen.get(c.pin).catch(() => null))) {
    await almacen.set(c.pin, viejo);
    const i = await almacen.get(LEGADO_INTENTOS).catch(() => null);
    if (i) await almacen.set(c.intentos, i);
  }
  await almacen.borrar(LEGADO).catch(() => {});
  await almacen.borrar(LEGADO_INTENTOS).catch(() => {});
}

async function leerIntentos(): Promise<Intentos> {
  try {
    const t = await almacen.get(claves().intentos);
    const i = t ? (JSON.parse(t) as Partial<Intentos>) : null;
    return { fallos: Number(i?.fallos) || 0, ultimo: typeof i?.ultimo === 'number' ? i.ultimo : null };
  } catch {
    return { fallos: 0, ultimo: null };
  }
}

async function leerPin(): Promise<PinGuardado | null> {
  const c = clavesPin(cuenta);
  if (!c) return null;
  await migrarLegado(c).catch(() => {});
  return leerPinGuardado(await almacen.get(c.pin).catch(() => null));
}

/** Cantidad de números del PIN guardado, o null si no hay PIN. */
export async function largoPin(): Promise<number | null> {
  return (await leerPin())?.largo ?? null;
}

export async function pinActivo(): Promise<boolean> {
  return (await leerPin()) != null;
}

/** Guarda un PIN nuevo (reemplaza el anterior). Devuelve el motivo si no sirve. */
export async function guardarPin(pin: string): Promise<string | null> {
  const problema = problemaPin(pin);
  if (problema) return problema;
  const c = claves();
  await almacen.set(c.pin, JSON.stringify(crearRegistroPin(pin, nuevaSal())));
  await almacen.borrar(c.intentos);
  return null;
}

/** Borra el PIN de la cuenta con sesión (sin sesión no hace nada). */
export async function borrarPin(): Promise<void> {
  const c = clavesPin(cuenta);
  if (!c) return;
  await almacen.borrar(c.pin);
  await almacen.borrar(c.intentos);
}

export type ResultadoPin =
  | { ok: true }
  | { ok: false; motivo: 'incorrecto'; quedanAntesDeEsperar: number; quedanAntesDeSalir: number }
  | { ok: false; motivo: 'esperar'; segundos: number }
  | { ok: false; motivo: 'demasiados' }
  | { ok: false; motivo: 'sin-pin' };

/** Segundos que faltan para poder probar el PIN otra vez (0 si ya se puede). */
export async function esperaPin(): Promise<number> {
  const i = await leerIntentos();
  return segundosRestantes(i.fallos, i.ultimo, Date.now());
}

/**
 * Comprueba el PIN contando los intentos fallidos (que se guardan, así cerrar
 * y abrir la app no reinicia la cuenta). Con FALLOS_MAXIMOS fallos seguidos
 * devuelve 'demasiados': hay que confirmar la cuenta ("¿Olvidaste tu PIN?").
 */
export async function comprobarPin(pin: string): Promise<ResultadoPin> {
  const guardado = await leerPin();
  if (!guardado) return { ok: false, motivo: 'sin-pin' };
  const i = await leerIntentos();
  if (i.fallos >= FALLOS_MAXIMOS) return { ok: false, motivo: 'demasiados' };
  const espera = segundosRestantes(i.fallos, i.ultimo, Date.now());
  if (espera > 0) return { ok: false, motivo: 'esperar', segundos: espera };
  if (pinCoincide(pin, guardado)) {
    await almacen.borrar(claves().intentos);
    return { ok: true };
  }
  const fallos = i.fallos + 1;
  await almacen.set(claves().intentos, JSON.stringify({ fallos, ultimo: Date.now() }));
  if (fallos >= FALLOS_MAXIMOS) return { ok: false, motivo: 'demasiados' };
  const espera2 = segundosRestantes(fallos, Date.now(), Date.now());
  if (espera2 > 0) return { ok: false, motivo: 'esperar', segundos: espera2 };
  return { ok: false, motivo: 'incorrecto', quedanAntesDeEsperar: Math.max(0, FALLOS_LIBRES - fallos), quedanAntesDeSalir: FALLOS_MAXIMOS - fallos };
}

/** Después de entrar con la huella se reinicia la cuenta de fallos del PIN. */
export async function reiniciarIntentosPin(): Promise<void> {
  const c = clavesPin(cuenta);
  if (c) await almacen.borrar(c.intentos);
}
