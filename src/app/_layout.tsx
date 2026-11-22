import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Bloqueo } from '../components/Bloqueo';
import { Boton, Mensaje } from '../components/ui';
import { SesionProvider, useSesion } from '../context/SesionProvider';
import { colores } from '../tema';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navegacion() {
  const { cargando, sesion, perfil, errorPerfil, bloqueado, recargarPerfil } = useSesion();

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.fondo }}>
        <ActivityIndicator color={colores.marino} size="large" />
      </View>
    );
  }
  if (sesion && bloqueado) return <Bloqueo />;

  // Sin perfil por un error de red: reintentar en vez de mandar al onboarding.
  if (sesion && !perfil && errorPerfil) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colores.fondo }}>
        <Text accessibilityRole="header" style={{ fontSize: 20, color: colores.marino, textAlign: 'center', marginBottom: 8 }}>
          Sin conexión
        </Text>
        <Mensaje texto={errorPerfil} />
        <Boton texto="Reintentar" onPress={recargarPerfil} />
      </View>
    );
  }

  const conCarrera = Boolean(perfil?.plan_id);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo } }}>
      <Stack.Protected guard={!sesion}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(sesion) && !conCarrera}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(sesion) && conCarrera}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="perfil" options={{ presentation: 'modal', headerShown: true, title: 'Mi perfil' }} />
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
        <StatusBar style="dark" />
        <Navegacion />
      </SesionProvider>
    </SafeAreaProvider>
  );
}
