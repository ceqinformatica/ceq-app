/**
 * Lo último que se cargó de cada pantalla, guardado en el celular para poder
 * usar la app sin internet (malla, firma, agenda, carnet, avisos, trámites).
 * Va separado por usuario y se borra al cerrar sesión.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { claveCache, deserializar, PREFIJO_CACHE, serializar } from '../lib/cache';
import { MODO_DEMO } from './demo';

let usuario: string | null = null;
/** Sube con cada borrado: una escritura que empezó antes no se guarda. */
let generacion = 0;

/** Lo llama la sesión: sin usuario no se lee ni se guarda nada. */
export function fijarUsuarioCache(uid: string | null) {
  usuario = uid;
}

export async function leerCache<T>(clave: string): Promise<{ valor: T; guardado: number } | null> {
  if (!usuario || MODO_DEMO) return null;
  try {
    const texto = await AsyncStorage.getItem(claveCache(usuario, clave));
    if (!texto) return null;
    const { t, v } = JSON.parse(texto) as { t: number; v: string };
    return { valor: deserializar<T>(v), guardado: t };
  } catch {
    return null;
  }
}

export async function guardarCache(clave: string, valor: unknown): Promise<void> {
  if (!usuario || MODO_DEMO) return;
  const gen = generacion;
  const k = claveCache(usuario, clave);
  try {
    const texto = JSON.stringify({ t: Date.now(), v: serializar(valor) });
    if (gen !== generacion) return;
    await AsyncStorage.setItem(k, texto);
    // Si se borró todo mientras se escribía, se saca esto también.
    if (gen !== generacion) await AsyncStorage.removeItem(k);
  } catch {
    // Sin espacio o sin permiso: la app sigue andando, solo no queda guardado.
  }
}

/** Borra todo lo guardado (al cerrar sesión o eliminar la cuenta). */
export async function borrarCache(): Promise<void> {
  generacion++;
  try {
    const claves = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIJO_CACHE));
    if (claves.length) await AsyncStorage.multiRemove(claves);
  } catch {
    // Nada que hacer.
  }
}
