import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { alFallarSalida, recibirEnlacePin } from '../lib/auth';
import { AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Bloqueo } from '../components/Bloqueo';
import { Recorrido } from '../components/Recorrido';
import { Arranque } from '../components/Arranque';
import { Boton, EstadoVacio, Mensaje } from '../components/ui';
import { SesionProvider, useSesion } from '../context/SesionProvider';
import { configurarNotificaciones, registrarEsteCelular, rutaDeNotificacion } from '../lib/notificaciones';
import { fondos } from '../tema';
import { RecorridoProvider } from '../context/RecorridoProvider';
import { TemaProvider, useCargarPreferenciaTema, useTema } from '../context/TemaProvider';
import { useOrientacionPorDispositivo } from '../components/disposicion';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Cuánto se ve como mínimo la animación de arranque (ms). */
const DURACION_ARRANQUE = 1400;
configurarNotificaciones();

/**
 * Registra el celular para recibir notificaciones cuando hay sesión y
 * carrera, y abre la pantalla de la notificación que se tocó.
 */
function useNotificaciones(uid: string | null, lista: boolean) {
  const registrado = useRef<string | null>(null);
  const [reintento, setReintento] = useState(0);
  useEffect(() => {
    // Al cerrar sesión se borra el celular: al volver a entrar hay que registrarlo de nuevo.
    if (!uid) registrado.current = null;
    if (!uid || !lista || registrado.current === uid) return;
    let activo = true;
    const intentar = () =>
      registrarEsteCelular()
        .catch(() => 'error' as const)
        .then((r) => {
          // Solo se da por registrado si el servidor lo confirmó (o si no hay
          // nada que registrar). Si falló, se reintenta al volver a la app.
          if (activo && r !== 'error') registrado.current = uid;
          return r;
        });
    intentar();
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && registrado.current !== uid) intentar();
    });
    return () => {
      activo = false;
      sub.remove();
    };
  }, [uid, lista, reintento]);

  // Un cierre de sesión que falló a medias (incluso desde el bloqueo) pudo borrar
  // el registro: se olvida y el efecto de arriba vuelve a registrar el celular
  // en cuanto haya sesión lista. Se escucha siempre, sin depender del registro.
  useEffect(
    () =>
      alFallarSalida(() => {
        registrado.current = null;
        setReintento((n) => n + 1);
      }),
    [],
  );

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
  const { fijarSoloClaro } = useTema();
  const { cargando, sesion, perfil, errorPerfil, bloqueado, recargarPerfil } = useSesion();
  // Acceso (sin sesión) y bloqueo van siempre en claro, como la maqueta. Antes de dibujar, para que no parpadee.
  const soloClaro = !cargando && (!sesion || bloqueado);
  useLayoutEffect(() => {
    fijarSoloClaro(soloClaro);
  }, [soloClaro, fijarSoloClaro]);
  const [arranqueVisto, setArranqueVisto] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArranqueVisto(true), DURACION_ARRANQUE);
    return () => clearTimeout(t);
  }, []);
  // Recién con las pantallas montadas (después del arranque) se puede abrir la de una notificación.
  useNotificaciones(sesion?.user.id ?? null, !cargando && arranqueVisto && !bloqueado && Boolean(perfil?.plan_id));

  // La animación de arranque se ve al menos un momento, aunque la sesión cargue al toque.
  if (cargando || !arranqueVisto) return <Arranque />;
  if (sesion && bloqueado) return <Bloqueo />;

  // Sin perfil por un error de red: reintentar en vez de mandar al onboarding.
  if (sesion && !perfil && errorPerfil) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: fondos.fondo }}>
        <EstadoVacio icono="cloud-offline-outline" titulo="Sin conexión" texto="No pudimos cargar tu perfil. Revisá tu internet y probá de nuevo." />
        <Mensaje texto={errorPerfil} />
        <Boton texto="Reintentar" icono="refresh" onPress={recargarPerfil} />
      </View>
    );
  }

  const conCarrera = Boolean(perfil?.plan_id);
  const esAdmin = conCarrera && perfil?.rol === 'admin';
  // Adónde ir cuando la pantalla abierta queda prohibida (p. ej. al iniciar
  // sesión). Sin esto, expo-router elige la primera pantalla libre, que podía
  // ser auth/pin, y quedaba en blanco.
  const inicio = !sesion ? '/login' : conCarrera ? '/' : '/onboarding';
  return (
    <>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: fondos.fondo }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!sesion} redirectTo={inicio}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(sesion) && !conCarrera} redirectTo={inicio}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(sesion) && conCarrera} redirectTo={inicio}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="perfil" />
        <Stack.Screen name="pin" />
        <Stack.Screen name="materia/[id]" />
        <Stack.Screen name="firma/[id]" />
        <Stack.Screen name="extracto" />
        <Stack.Screen name="estadisticas" />
        <Stack.Screen name="carnet" />
        <Stack.Screen name="carnet-validar" />
        <Stack.Screen name="verificar" />
        <Stack.Screen name="avisos" />
        <Stack.Screen name="aviso/[id]" />
        <Stack.Screen name="tramites" />
        <Stack.Screen name="calendario" />
        <Stack.Screen name="tramite/[id]" />
        <Stack.Screen name="finales-fechas" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(sesion) && esAdmin} redirectTo={inicio}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" />
      {/* Enlace del correo "¿Olvidaste tu contraseña?" (con o sin sesión) y Cambiar contraseña. */}
      <Stack.Screen name="auth/restablecer" />
    </Stack>
    {/* Ventanitas de bienvenida: la primera vez que la cuenta entra (o al pedirlo desde el perfil). */}
    {conCarrera && <Recorrido />}
    </>
  );
}

export default function RootLayout() {
  // El enlace del correo para recuperar el PIN se canjea acá, siempre montado:
  // así no se pierde si la app se bloquea o si todavía no hay pantalla esperando.
  useEffect(() => {
    Linking.getInitialURL().then(recibirEnlacePin).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => recibirEnlacePin(url));
    return () => sub.remove();
  }, []);
  useOrientacionPorDispositivo();
  const tema = useCargarPreferenciaTema();
  const [fuentesListas, errorFuentes] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const listo = (fuentesListas || Boolean(errorFuentes)) && tema.lista;

  useEffect(() => {
    if (listo) SplashScreen.hideAsync().catch(() => {});
  }, [listo]);

  if (!listo) return null;

  return (
    <SafeAreaProvider>
      <TemaProvider inicial={tema.inicial}>
        <SesionProvider>
          <StatusBar style="light" />
          <RecorridoProvider>
            <Navegacion />
          </RecorridoProvider>
        </SesionProvider>
      </TemaProvider>
    </SafeAreaProvider>
  );
}
