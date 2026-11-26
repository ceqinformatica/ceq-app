import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { clavesPin } from './pin';
import { cuentaActual, pinActivo } from './pinGuardado';

/**
 * Desbloqueo con huella o rostro.
 *
 * Los datos biométricos nunca salen del celular: el sistema operativo solo
 * responde "sí, es el dueño". La preferencia se guarda cifrada en el celular,
 * por cuenta (como el PIN): si en el mismo celular se entra con otra cuenta,
 * esa no pide la huella de la primera.
 */
/** Antes la huella era una sola para todo el celular. */
const LEGADO = 'ceq_biometria_activa';

const clave = () => clavesPin(cuentaActual())?.biometria ?? null;

/**
 * La huella guardada a la vieja (una para todo el celular) pasa a la primera
 * cuenta con PIN que entra: es la que la tenía activa junto con su PIN. Una
 * cuenta sin PIN no la hereda (si no, otra cuenta del mismo celular, como una
 * de prueba, pedía la huella de la cuenta personal).
 */
async function migrarLegado(c: string) {
  if ((await SecureStore.getItemAsync(LEGADO)) !== '1') return;
  if (!(await pinActivo().catch(() => false))) return;
  await SecureStore.setItemAsync(c, '1');
  await SecureStore.deleteItemAsync(LEGADO);
}

export async function biometriaDisponible(): Promise<{ disponible: boolean; nombre: string }> {
  if (Platform.OS === 'web') return { disponible: false, nombre: 'Biometría' };
  const [hardware, registrada, tipos] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const rostro = tipos.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  return { disponible: hardware && registrada, nombre: rostro ? 'reconocimiento facial' : 'huella' };
}

export async function biometriaActiva(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const c = clave();
  if (!c) return false;
  await migrarLegado(c).catch(() => {});
  return (await SecureStore.getItemAsync(c)) === '1';
}

export async function verificarIdentidad(motivo = 'Desbloqueá Portal CEQ'): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: motivo,
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false,
  });
  return r.success;
}

/** Activa la biometría solo si el dueño la confirma en ese momento. */
export async function activarBiometria(): Promise<boolean> {
  const ok = await verificarIdentidad('Confirmá para activar el desbloqueo');
  const c = clave();
  if (!c) return false;
  if (ok) await SecureStore.setItemAsync(c, '1');
  return ok;
}

export async function desactivarBiometria() {
  const c = clave();
  if (c) await SecureStore.deleteItemAsync(c);
}
