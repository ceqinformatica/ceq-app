import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useRecorrido } from '../context/RecorridoProvider';
import { useTema } from '../context/TemaProvider';
import { PASOS_RECORRIDO, posicionVentana, zonaPestana, type Rect } from '../lib/recorrido';
import { colores, crearEstilos, espacio, fondos, fuentes, radio, sombras, texto } from '../tema';
import { useDisposicion } from './disposicion';

/** Rectángulo de toda la pantalla con un hueco redondeado (la pestaña resaltada). */
function caminoConHueco(ancho: number, alto: number, h: Rect | null, r = 18) {
  const fondo = `M0 0H${ancho}V${alto}H0Z`;
  if (!h) return fondo;
  const { x, y, ancho: w, alto: a } = h;
  const rr = Math.min(r, w / 2, a / 2);
  return `${fondo} M${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}V${y + a - rr}A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + a}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + a - rr}V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z`;
}

/**
 * Ventanitas flotantes del recorrido de bienvenida. Oscurece la app, resalta
 * la pestaña de la que se habla y muestra Anterior / Siguiente / Saltar.
 */
export function Recorrido() {
  useTema();
  const { activo, paso, siguiente, anterior, terminar } = useRecorrido();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { barraLateral } = useDisposicion();
  const [altoVentana, setAltoVentana] = useState(240);
  const [aparicion] = useState(() => new Animated.Value(0));

  const p = PASOS_RECORRIDO[paso] ?? PASOS_RECORRIDO[0];
  const ultimo = paso === PASOS_RECORRIDO.length - 1;
  // Igual que en src/app/(tabs)/_layout.tsx.
  const abajo = Math.max(insets.bottom, Platform.OS === 'web' ? 8 : 6);
  const zona = p.pestana == null ? null : zonaPestana(p.pestana, width, height, { barraLateral, abajo, arriba: insets.top });
  const pos = posicionVentana(zona, width, height, { barraLateral, altoVentana, arriba: insets.top });

  // Cada paso entra con un fundido y un pequeño desplazamiento (sin movimiento si el celular lo pide).
  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    aparicion.setValue(0);
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reducir) => {
        if (cancelado) return;
        if (reducir) aparicion.setValue(1);
        else Animated.timing(aparicion, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
      });
    return () => { cancelado = true; };
  }, [activo, paso, aparicion]);

  if (!activo) return null;

  const desplazamiento = aparicion.interpolate({ inputRange: [0, 1], outputRange: [pos.flecha?.lado === 'izquierda' ? 0 : 10, 0] });
  const lateral = aparicion.interpolate({ inputRange: [0, 1], outputRange: [pos.flecha?.lado === 'izquierda' ? -10 : 0, 0] });

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={terminar} supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1 }} accessibilityViewIsModal>
        {/* Fondo oscuro con el hueco en la pestaña. Tocarlo no hace nada: se avanza con los botones. */}
        <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          <Path d={caminoConHueco(width, height, zona)} fill="rgba(6, 22, 34, 0.62)" fillRule="evenodd" />
        </Svg>
        {zona && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: zona.x - 3, top: zona.y - 3, width: zona.ancho + 6, height: zona.alto + 6, borderRadius: 21, borderWidth: 2.5, borderColor: '#8FD0F3' }}
          />
        )}

        <Animated.View
          onLayout={(e) => {
            const a = Math.round(e.nativeEvent.layout.height);
            if (Math.abs(a - altoVentana) > 1) setAltoVentana(a);
          }}
          style={[est.ventana, { left: pos.x, top: pos.y, width: pos.ancho, opacity: aparicion, transform: [{ translateY: desplazamiento }, { translateX: lateral }] }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {pos.flecha && (
            <View
              pointerEvents="none"
              style={[
                est.flecha,
                pos.flecha.lado === 'abajo'
                  ? { bottom: -7, left: Math.min(Math.max(pos.flecha.desplazamiento - 7, 18), pos.ancho - 32) }
                  : { left: -7, top: Math.min(Math.max(pos.flecha.desplazamiento - 7, 18), altoVentana - 32) },
              ]}
            />
          )}

          <View style={est.cabecera}>
            <View style={est.icono}>
              <Ionicons name={p.icono} size={20} color={colores.marino} />
            </View>
            <Text style={est.contador} accessibilityLabel={`Paso ${paso + 1} de ${PASOS_RECORRIDO.length}`}>
              {paso + 1} / {PASOS_RECORRIDO.length}
            </Text>
            <Pressable onPress={terminar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Saltar el recorrido" style={{ marginLeft: 'auto' }}>
              <Text style={est.saltar}>Saltar</Text>
            </Pressable>
          </View>

          <Text style={est.titulo} accessibilityRole="header">{p.titulo}</Text>
          <Text style={est.texto}>{p.texto}</Text>

          <View style={est.pie}>
            <View style={est.puntos} importantForAccessibility="no-hide-descendants">
              {PASOS_RECORRIDO.map((_, i) => (
                <View key={i} style={[est.punto, i === paso && est.puntoActivo]} />
              ))}
            </View>
            {paso > 0 && (
              <Pressable onPress={anterior} hitSlop={6} accessibilityRole="button" accessibilityLabel="Paso anterior" style={({ pressed }) => [est.botonSecundario, pressed && { opacity: 0.7 }]}>
                <Ionicons name="chevron-back" size={18} color={colores.marino} />
              </Pressable>
            )}
            <Pressable
              onPress={siguiente}
              accessibilityRole="button"
              accessibilityLabel={ultimo ? 'Terminar el recorrido' : 'Siguiente paso'}
              style={({ pressed }) => [est.boton, pressed && { opacity: 0.85 }]}
            >
              <Text style={est.botonTexto}>{paso === 0 ? 'EMPEZAR' : ultimo ? 'LISTO' : 'SIGUIENTE'}</Text>
              {!ultimo && <Ionicons name="arrow-forward" size={16} color={colores.blanco} />}
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const est = crearEstilos(() => ({
  ventana: {
    position: 'absolute',
    backgroundColor: fondos.superficieBlanca,
    borderRadius: radio.xl,
    padding: espacio.l,
    ...sombras.fuerte,
  },
  flecha: {
    position: 'absolute',
    width: 14,
    height: 14,
    backgroundColor: fondos.superficieBlanca,
    transform: [{ rotate: '45deg' }],
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginBottom: espacio.m },
  icono: { width: 36, height: 36, borderRadius: 18, backgroundColor: fondos.cielo, alignItems: 'center', justifyContent: 'center' },
  contador: { fontFamily: fuentes.semibold, fontSize: 12.5, color: colores.textoSuave, letterSpacing: 0.4 },
  saltar: { fontFamily: fuentes.semibold, fontSize: 14, color: colores.textoSuave },
  titulo: { ...texto.subtitulo, color: colores.marino, marginBottom: espacio.xs },
  texto: { ...texto.cuerpo, color: colores.texto },
  pie: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginTop: espacio.l },
  puntos: { flexDirection: 'row', gap: 5, marginRight: 'auto' },
  punto: { width: 6, height: 6, borderRadius: 3, backgroundColor: fondos.linea },
  puntoActivo: { width: 16, backgroundColor: fondos.marino },
  botonSecundario: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colores.linea, alignItems: 'center', justifyContent: 'center' },
  boton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: espacio.l, borderRadius: radio.pill, backgroundColor: fondos.marino },
  botonTexto: { fontFamily: fuentes.bold, fontSize: 13.5, letterSpacing: 0.6, color: colores.blanco },
}));
