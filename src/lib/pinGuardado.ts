import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { crearRegistroPin, FALLOS_LIBRES, FALLOS_MAXIMOS, leerPinGuardado, nuevaSal, pinCoincide, problemaPin, segundosRestantes, type PinGuardado } from './pin';

/**
 * PIN de la app guardado en este dispositivo (cifrado por el sistema).
 * Sirve donde no hay huella (por ejemplo una tablet) o como respaldo de la huella.
 */
const CLAVE = 'ceq_pin';
const CLAVE_INTENTOS = 'ceq_pin_intentos';

const almacen = {
  get: (k: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.setItem(k, v)) : SecureStore.setItemAsync(k, v)),
  borrar: (k: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.removeItem(k)) : SecureStore.deleteItemAsync(k)),
};

interface Intentos { fallos: number; ultimo: number | null }

async function leerIntentos(): Promise<Intentos> {
  try {
    const t = await almacen.get(CLAVE_INTENTOS);
    const i = t ? (JSON.parse(t) as Partial<Intentos>) : null;
    return { fallos: Number(i?.fallos) || 0, ultimo: typeof i?.ultimo === 'number' ? i.ultimo : null };
  } catch {
    return { fallos: 0, ultimo: null };
  }
}

async function leerPin(): Promise<PinGuardado | null> {
  return leerPinGuardado(await almacen.get(CLAVE).catch(() => null));
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
  await almacen.set(CLAVE, JSON.stringify(crearRegistroPin(pin, nuevaSal())));
  await almacen.borrar(CLAVE_INTENTOS);
  return null;
}

export async function borrarPin(): Promise<void> {
  await almacen.borrar(CLAVE);
  await almacen.borrar(CLAVE_INTENTOS);
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
 * devuelve 'demasiados': hay que cerrar sesión y volver a entrar con Google.
 */
export async function comprobarPin(pin: string): Promise<ResultadoPin> {
  const guardado = await leerPin();
  if (!guardado) return { ok: false, motivo: 'sin-pin' };
  const i = await leerIntentos();
  if (i.fallos >= FALLOS_MAXIMOS) return { ok: false, motivo: 'demasiados' };
  const espera = segundosRestantes(i.fallos, i.ultimo, Date.now());
  if (espera > 0) return { ok: false, motivo: 'esperar', segundos: espera };
  if (pinCoincide(pin, guardado)) {
    await almacen.borrar(CLAVE_INTENTOS);
    return { ok: true };
  }
  const fallos = i.fallos + 1;
  await almacen.set(CLAVE_INTENTOS, JSON.stringify({ fallos, ultimo: Date.now() }));
  if (fallos >= FALLOS_MAXIMOS) return { ok: false, motivo: 'demasiados' };
  const espera2 = segundosRestantes(fallos, Date.now(), Date.now());
  if (espera2 > 0) return { ok: false, motivo: 'esperar', segundos: espera2 };
  return { ok: false, motivo: 'incorrecto', quedanAntesDeEsperar: Math.max(0, FALLOS_LIBRES - fallos), quedanAntesDeSalir: FALLOS_MAXIMOS - fallos };
}
