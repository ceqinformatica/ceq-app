import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Image, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Bloqueo } from '../components/Bloqueo';
import { Hexagono } from '../components/graficos';
import { Boton, EstadoVacio, logoCeq, Mensaje } from '../components/ui';
import { SesionProvider, useSesion } from '../context/SesionProvider';
import { configurarNotificaciones, registrarEsteCelular, rutaDeNotificacion } from '../lib/notificaciones';
import { colores } from '../tema';

SplashScreen.preventAutoHideAsync().catch(() => {});
configurarNotificaciones();

/**
 * Registra el celular para recibir notificaciones cuando hay sesión y
 * carrera, y abre la pantalla de la notificación que se tocó.
 */
function useNotificaciones(uid: string | null, lista: boolean) {
  const registrado = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || !lista || registrado.current === uid) return;
    registrado.current = uid;
    registrarEsteCelular().catch(() => {});
  }, [uid, lista]);

  useEffect(() => {
    if (!lista || Platform.OS === 'web') return;
    const abrir = (r: Notifications.NotificationResponse | null) => {
      const ruta = rutaDeNotificacion(r);
      if (ruta) router.push(ruta as never);
      // Para no volver a abrirla en el próximo arranque.
      if (r) Notifications.clearLastNotificationResponse();
    };
    // La app se abrió tocando una notificación.
    abrir(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(abrir);
    return () => sub.remove();
  }, [lista]);
}

function Navegacion() {
  const { cargando, sesion, perfil, errorPerfil, bloqueado, recargarPerfil } = useSesion();
  useNotificaciones(sesion?.user.id ?? null, !cargando && !bloqueado && Boolean(perfil?.plan_id));

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.marino, gap: 28 }}>
        <Hexagono tamano={104} relleno={colores.blanco}>
          <Image source={logoCeq} style={{ width: 70, height: 70 }} accessibilityLabel="Logo del CEQ" />
        </Hexagono>
        <ActivityIndicator color={colores.blanco} />
      </View>
    );
  }
  if (sesion && bloqueado) return <Bloqueo />;

  // Sin perfil por un error de red: reintentar en vez de mandar al onboarding.
  if (sesion && !perfil && errorPerfil) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colores.fondo }}>
        <EstadoVacio icono="cloud-offline-outline" titulo="Sin conexión" texto="No pudimos cargar tu perfil. Revisá tu internet y probá de nuevo." />
        <Mensaje texto={errorPerfil} />
        <Boton texto="Reintentar" icono="refresh" onPress={recargarPerfil} />
      </View>
    );
  }

  const conCarrera = Boolean(perfil?.plan_id);
  const esAdmin = conCarrera && perfil?.rol === 'admin';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!sesion}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(sesion) && !conCarrera}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(sesion) && conCarrera}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="perfil" />
        <Stack.Screen name="materia/[id]" />
        <Stack.Screen name="firma/[id]" />
        <Stack.Screen name="extracto" />
        <Stack.Screen name="carnet" />
        <Stack.Screen name="avisos" />
        <Stack.Screen name="aviso/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(sesion) && esAdmin}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fuentesListas, errorFuentes] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const listo = fuentesListas || Boolean(errorFuentes);

  useEffect(() => {
    if (listo) SplashScreen.hideAsync().catch(() => {});
  }, [listo]);

  if (!listo) return null;

  return (
    <SafeAreaProvider>
      <SesionProvider>
        <StatusBar style="light" />
        <Navegacion />
      </SesionProvider>
    </SafeAreaProvider>
  );
}
