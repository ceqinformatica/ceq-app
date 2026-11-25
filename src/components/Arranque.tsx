/**
 * Pantalla de arranque (la animación que mandó Josie): el logo del CEQ,
 * "Portal" con una línea, "CEQ" grande y una barrita que va y viene
 * debajo con "Cargando…". Se ve mientras se abre la sesión.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Text, View, type LayoutChangeEvent } from 'react-native';
import { esquemaActual, fuentes } from '../tema';
import { movimientoReducido } from './movimiento';
import { logoCeq } from './ui';

/** Colores del arranque (tomados del GIF), con su versión para el tema oscuro. */
function paleta() {
  return esquemaActual() === 'oscuro'
    ? { fondo: '#0B1222', texto: '#D3E2F8', suave: '#9DBFF2', linea: '#3467B8', riel: '#1A2D52', barra: '#8FD0F3' }
    : { fondo: '#EAF4FA', texto: '#153D62', suave: '#2C4F72', linea: '#8DC3E3', riel: '#CFE3F0', barra: '#2F7BAA' };
}

/** Ancho de la barrita que se mueve, en proporción al riel. */
const PROPORCION = 0.32;

export function Arranque() {
  const c = paleta();
  const quieto = movimientoReducido();
  const entrada = useRef(new Animated.Value(quieto ? 1 : 0)).current;
  const vaiven = useRef(new Animated.Value(0)).current;
  const [riel, setRiel] = useState(72);

  useEffect(() => {
    if (quieto) return;
    Animated.timing(entrada, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // La barrita va de izquierda a derecha y vuelve, sin parar.
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(vaiven, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(vaiven, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    bucle.start();
    return () => bucle.stop();
  }, [quieto, entrada, vaiven]);

  const ancho = riel * PROPORCION;
  const desplazamiento = vaiven.interpolate({ inputRange: [0, 1], outputRange: [0, riel - ancho] });
  const oscuro = esquemaActual() === 'oscuro';

  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.fondo }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Portal CEQ. Cargando"
    >
      <Animated.View
        style={{
          alignItems: 'center',
          opacity: entrada,
          transform: [{ scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }}
      >
        {/* En el tema oscuro el logo va sobre un círculo blanco para que se vea. */}
        <View style={oscuro ? { width: 92, height: 92, borderRadius: 46, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' } : undefined}>
          <Image source={logoCeq} style={{ width: 72, height: 72 }} accessibilityIgnoresInvertColors />
        </View>

        <View style={{ marginTop: 10, alignItems: 'stretch' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontFamily: fuentes.medium, fontSize: 15, color: c.suave }}>Portal</Text>
            <View style={{ flex: 1, height: 1.5, backgroundColor: c.linea, borderRadius: 1 }} />
          </View>
          <Text style={{ fontFamily: fuentes.bold, fontSize: 46, lineHeight: 50, letterSpacing: -0.5, color: c.texto, marginTop: -2 }}>CEQ</Text>
        </View>

        <View
          onLayout={(e: LayoutChangeEvent) => setRiel(e.nativeEvent.layout.width)}
          style={{ width: 72, height: 4, borderRadius: 2, backgroundColor: c.riel, marginTop: 18, overflow: 'hidden' }}
        >
          <Animated.View
            style={{ width: ancho, height: 4, borderRadius: 2, backgroundColor: c.barra, transform: [{ translateX: quieto ? (riel - ancho) / 2 : desplazamiento }] }}
          />
        </View>
        <Text style={{ fontFamily: fuentes.regular, fontSize: 12.5, color: c.suave, marginTop: 8 }}>Cargando…</Text>
      </Animated.View>
    </View>
  );
}
