import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { entregarEnlacePin, hayEnlacePinPendiente } from '../../lib/enlace-pin';
import { colores, fondos } from '../../tema';
import { useTema } from '../../context/TemaProvider';

// El enlace del correo "¿Olvidaste tu PIN?" vuelve a ceqapp://auth/pin?code=...
// Con la app desbloqueada llega por acá: se entrega a la pantalla del PIN,
// que lo canjea y comprueba que sea de la misma cuenta. (Con la app
// bloqueada lo recibe directamente el bloqueo.)
export default function EnlacePin() {
  useTema();
  const p = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();

  useEffect(() => {
    if (typeof p.code === 'string') entregarEnlacePin({ code: p.code });
    else entregarEnlacePin({ error: String(p.error_description ?? p.error ?? 'El enlace no es válido.') });
    // Si la pantalla del PIN lo estaba esperando, ya lo recibió: se vuelve a ella.
    // Si no, se abre "¿Olvidaste tu PIN?" para que lo canjee.
    if (!hayEnlacePinPendiente() && router.canGoBack()) router.back();
    else router.replace('/pin?modo=cambiar&recuperar=1');
  }, [p.code, p.error, p.error_description]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: fondos.fondo }}>
      <ActivityIndicator color={colores.marino} size="large" accessibilityLabel="Comprobando el enlace" />
    </View>
  );
}
