import TopTabs from 'expo-router/js-top-tabs';
import { ANCHO_BARRA_LATERAL, BarraPestanas } from '../../components/BarraPestanas';
import { useDisposicion } from '../../components/disposicion';
import { movimientoReducido } from '../../components/movimiento';
import { VentanasDelCeq } from '../../components/Ventana';
import { useTema } from '../../context/TemaProvider';
import { fondos } from '../../tema';

/**
 * Pestañas como páginas una al lado de la otra: se pasa de Inicio a Mi
 * carrera (y así) deslizando el dedo a los costados, o tocando la barra.
 * El deslizador es nativo (react-native-pager-view), así que la página sigue
 * al dedo sin trabarse y nunca se ven dos pantallas superpuestas.
 */
export default function TabsLayout() {
  useTema();
  // Tablet en horizontal: las pestañas van en una barra a la izquierda.
  const { barraLateral } = useDisposicion();
  const quieto = movimientoReducido();
  return (
    <>
      <TopTabs
        tabBarPosition="bottom"
        tabBar={(props) => <BarraPestanas {...props} lateral={barraLateral} />}
        // Con la barra a la izquierda, el deslizador ocupa el resto del ancho
        // (así cada página mide lo que debe) y la barra se dibuja en el margen.
        style={[{ backgroundColor: fondos.fondo }, barraLateral && { marginLeft: ANCHO_BARRA_LATERAL, overflow: 'visible' }]}
        keyboardDismissMode="on-drag"
        screenOptions={{
          swipeEnabled: true,
          animationEnabled: !quieto,
          sceneStyle: { backgroundColor: fondos.fondo },
        }}
      >
        <TopTabs.Screen name="index" options={{ title: 'Inicio' }} />
        <TopTabs.Screen name="carrera" options={{ title: 'Mi carrera' }} />
        <TopTabs.Screen name="firma" options={{ title: 'Parciales' }} />
        <TopTabs.Screen name="agenda" options={{ title: 'Agenda' }} />
        <TopTabs.Screen name="ceq" options={{ title: 'CEQ' }} />
      </TopTabs>
      {/* Carteles que arma el CEQ desde el panel. */}
      <VentanasDelCeq />
    </>
  );
}
