import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { canjearCodigo } from '../../lib/auth';
import { colores } from '../../tema';

// Google y el correo de confirmación vuelven a ceqapp://auth/callback?code=...
// Si llega un código (por ejemplo al tocar el enlace del correo), se canjea
// acá; el de Google ya lo canjea entrarConGoogle() y no se repite.
export default function Callback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [listo, setListo] = useState(!code);

  useEffect(() => {
    if (typeof code !== 'string') return;
    canjearCodigo(code).finally(() => setListo(true));
  }, [code]);

  if (listo) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.fondo }}>
      <ActivityIndicator color={colores.marino} size="large" accessibilityLabel="Iniciando sesión" />
    </View>
  );
}
