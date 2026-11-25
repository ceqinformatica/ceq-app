/**
 * Notificaciones push (Expo). El celular pide permiso, obtiene su token y
 * lo guarda en Supabase con registrar_dispositivo(). El envío lo hace la
 * base cada minuto (ver supabase/migrations/*_notificaciones.sql).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { MODO_DEMO } from '../datos/demo';
import { rutaSegura } from './programacion';
import { supabase } from './supabase';

const CLAVE_TOKEN = 'ceq.push.token';

export type EstadoRegistro = 'activo' | 'sin_permiso' | 'no_disponible' | 'error';

/** Con la app abierta también se muestra el aviso arriba. */
export function configurarNotificaciones() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('avisos', {
      name: 'Avisos del CEQ',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#2A8FCC',
    }).catch(() => {});
    Notifications.setNotificationChannelAsync('recordatorios', {
      name: 'Recordatorios de mi agenda',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#2A8FCC',
    }).catch(() => {});
  }
}

/**
 * Pide permiso (solo la primera vez muestra el cartel del sistema) y
 * guarda el token del celular a nombre del usuario actual.
 */
export async function registrarEsteCelular({ pedirPermiso = true } = {}): Promise<EstadoRegistro> {
  if (MODO_DEMO || Platform.OS === 'web' || !Device.isDevice) return 'no_disponible';
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && pedirPermiso) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return 'sin_permiso';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('registrar_dispositivo', { p_token: token, p_plataforma: Platform.OS });
    if (error) return 'error';
    await AsyncStorage.setItem(CLAVE_TOKEN, token).catch(() => {});
    return 'activo';
  } catch {
    // Por ejemplo: el APK se compiló sin la configuración de Firebase.
    return 'error';
  }
}

/**
 * Al cerrar sesión: este celular deja de recibir lo de esta cuenta. Si el
 * servidor no confirma la baja, lanza el error y conserva el token guardado
 * para poder reintentar (el cierre de sesión no sigue adelante).
 */
export async function olvidarEsteCelular() {
  if (MODO_DEMO) return;
  const token = await AsyncStorage.getItem(CLAVE_TOKEN).catch(() => null);
  if (!token) return;
  const { error } = await supabase.from('dispositivos').delete().eq('token', token);
  if (error) throw error;
  await AsyncStorage.removeItem(CLAVE_TOKEN).catch(() => {});
}

/** Pantalla que hay que abrir al tocar una notificación (o null). */
export function rutaDeNotificacion(r: Notifications.NotificationResponse | null): string | null {
  return rutaSegura(r?.notification.request.content.data?.ruta);
}
