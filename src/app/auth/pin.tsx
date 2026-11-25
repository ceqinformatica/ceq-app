import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { recibirEnlacePin } from '../../lib/auth';
import { escucharResultadoPin, hayEnlaceComprobando, hayPantallaPin, resultadoPin } from '../../lib/enlace-pin';
import { colores, fondos } from '../../tema';
import { useTema } from '../../context/TemaProvider';

// El enlace del correo "¿Olvidaste tu PIN?" vuelve a ceqapp://auth/pin?code=...
// El canje lo hace recibirEnlacePin (una sola vez por código, aunque también
// lo reciba el layout). Esta ruta solo lleva a la pantalla que toma el
// resultado; si ya se usó (por ejemplo, desde el bloqueo) o es un enlace viejo
// que Android volvió a entregar al reabrir la app, vuelve al inicio sin avisos.
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
    let hecho = false;
    const decidir = () => {
      // Todavía se está viendo si el enlace es nuevo: se espera.
      if (hecho || hayEnlaceComprobando()) return;
      hecho = true;
      if (!resultadoPin()) {
        // Ya se usó, es viejo o no se pidió: al inicio, sin pantallas de por medio.
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }
      else if (hayPantallaPin() && router.canGoBack()) router.back();
      else router.replace('/pin?modo=cambiar&recuperar=1');
    };
    decidir();
    if (hecho) return;
    const dejar = escucharResultadoPin(decidir);
    return () => {
      hecho = true;
      dejar();
    };
  }, [p.code, p.sb_flow_id, p.error, p.error_description]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: fondos.fondo }}>
      <ActivityIndicator color={colores.marino} size="large" accessibilityLabel="Comprobando el enlace" />
    </View>
  );
}
