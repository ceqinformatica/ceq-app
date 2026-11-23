import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Desbloqueo con huella o rostro.
 *
 * Los datos biométricos nunca salen del celular: el sistema operativo solo
 * responde "sí, es el dueño". La preferencia se guarda cifrada en el celular.
 */
const CLAVE = 'ceq_biometria_activa';

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
  return (await SecureStore.getItemAsync(CLAVE)) === '1';
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
  if (ok) await SecureStore.setItemAsync(CLAVE, '1');
  return ok;
}

export async function desactivarBiometria() {
  await SecureStore.deleteItemAsync(CLAVE);
}
