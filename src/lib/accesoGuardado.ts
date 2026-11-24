import AsyncStorage from '@react-native-async-storage/async-storage';
import { CLAVE_YA_ENTRO, modoInicial } from './acceso';

/** Recuerda que en este celular ya se entró con una cuenta. */
export async function marcarYaEntro(): Promise<void> {
  await AsyncStorage.setItem(CLAVE_YA_ENTRO, '1').catch(() => {});
}

/** Al borrar la cuenta, la próxima vez se vuelve a ver "Crear cuenta". */
export async function olvidarYaEntro(): Promise<void> {
  await AsyncStorage.removeItem(CLAVE_YA_ENTRO).catch(() => {});
}

/** Qué pantalla de acceso mostrar primero en este celular. */
export async function leerModoInicial(): Promise<'registro' | 'entrar'> {
  try {
    return modoInicial(await AsyncStorage.getItem(CLAVE_YA_ENTRO));
  } catch {
    return 'registro';
  }
}
