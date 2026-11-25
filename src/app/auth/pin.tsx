import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { recibirEnlacePin } from '../../lib/auth';
import { hayPantallaPin, resultadoPin } from '../../lib/enlace-pin';
import { colores, fondos } from '../../tema';
import { useTema } from '../../context/TemaProvider';

// El enlace del correo "¿Olvidaste tu PIN?" vuelve a ceqapp://auth/pin?code=...
// El canje lo hace recibirEnlacePin (una sola vez por código, aunque también
// lo reciba el layout). Esta ruta solo lleva a la pantalla que toma el
// resultado; si ya se usó (por ejemplo, desde el bloqueo), vuelve al inicio.
export default function EnlacePin() {
  useTema();
  const p = useLocalSearchParams<{ code?: string; sb_flow_id?: string; error?: string; error_description?: string }>();

  useEffect(() => {
    const q = new URLSearchParams();
    if (typeof p.code === 'string') q.set('code', p.code);
    if (typeof p.sb_flow_id === 'string') q.set('sb_flow_id', p.sb_flow_id);
    if (typeof p.error === 'string') q.set('error', p.error);
    if (typeof p.error_description === 'string') q.set('error_description', p.error_description);
    recibirEnlacePin(`ceqapp://auth/pin?${q.toString()}`);
    if (!resultadoPin()) router.replace('/');
    else if (hayPantallaPin() && router.canGoBack()) router.back();
    else router.replace('/pin?modo=cambiar&recuperar=1');
  }, [p.code, p.sb_flow_id, p.error, p.error_description]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: fondos.fondo }}>
      <ActivityIndicator color={colores.marino} size="large" accessibilityLabel="Comprobando el enlace" />
    </View>
  );
}
