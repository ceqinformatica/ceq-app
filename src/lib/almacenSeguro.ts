import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Almacenamiento cifrado para la sesión de Supabase.
 *
 * SecureStore guarda valores chicos (unos 2 KB), y una sesión puede ser más
 * grande, así que la partimos en trozos. En web (solo para desarrollo) usa
 * localStorage.
 */
const TROZO = 1800;
const clave = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export const almacenSeguro = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    const k = clave(key);
    const n = await SecureStore.getItemAsync(`${k}__n`);
    if (n == null) return null;
    const partes: string[] = [];
    for (let i = 0; i < Number(n); i++) {
      const p = await SecureStore.getItemAsync(`${k}__${i}`);
      if (p == null) return null;
      partes.push(p);
    }
    return partes.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return globalThis.localStorage?.setItem(key, value);
    const k = clave(key);
    await this.removeItem(key);
    const n = Math.ceil(value.length / TROZO);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${k}__${i}`, value.slice(i * TROZO, (i + 1) * TROZO));
    }
    await SecureStore.setItemAsync(`${k}__n`, String(n));
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(key);
    const k = clave(key);
    const n = await SecureStore.getItemAsync(`${k}__n`);
    if (n != null) {
      for (let i = 0; i < Number(n); i++) await SecureStore.deleteItemAsync(`${k}__${i}`);
      await SecureStore.deleteItemAsync(`${k}__n`);
    }
  },
};
