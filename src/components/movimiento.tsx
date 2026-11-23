import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Movimiento de la app: entradas suaves, rebote al tocar, números que
 * cuentan y una vibración leve. Todo respeta "Reducir movimiento" del
 * teléfono: si está activado, las cosas aparecen directamente.
 */

let reducido = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((r) => { reducido = r; })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (r) => { reducido = r; });

/** true si el teléfono pide reducir el movimiento. */
export const movimientoReducido = () => reducido;

/** Vibración corta al tocar algo importante (no hace nada en la web). */
export function vibrar(tipo: 'toque' | 'exito' = 'toque') {
  if (Platform.OS === 'web') return;
  const p = tipo === 'exito' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.selectionAsync();
  p.catch(() => {});
}

/** Estilo animado de entrada (opacidad y desplazamiento), para combinar con otros. */
export function useAparecer(retraso = 0, distancia = 14) {
  const v = useRef(new Animated.Value(reducido ? 1 : 0)).current;
  useEffect(() => {
    if (reducido) return;
    const a = Animated.timing(v, { toValue: 1, duration: 380, delay: retraso, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' });
    a.start();
    return () => a.stop();
  }, [v, retraso]);
  return { opacity: v, translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distancia, 0] }) };
}

/** Aparece subiendo un poco y ganando opacidad. `retraso` en ms para escalonar. */
export function Aparecer({ children, retraso = 0, estilo, distancia = 14 }: {
  children: ReactNode; retraso?: number; estilo?: StyleProp<ViewStyle>; distancia?: number;
}) {
  const { opacity, translateY } = useAparecer(retraso, distancia);
  return <Animated.View style={[estilo, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Pressable que acepta estilos animados (rebote al tocar). */
export const PressableAnimado = Animated.createAnimatedComponent(Pressable);

/** Escala para el rebote al tocar: usar `escala` en un Animated.View y los dos manejadores en el Pressable. */
export function usePresion(hasta = 0.96) {
  const escala = useRef(new Animated.Value(1)).current;
  const nativo = Platform.OS !== 'web';
  return {
    escala,
    onPressIn: () => {
      if (reducido) return;
      Animated.spring(escala, { toValue: hasta, speed: 40, bounciness: 0, useNativeDriver: nativo }).start();
    },
    onPressOut: () => {
      Animated.spring(escala, { toValue: 1, speed: 14, bounciness: 10, useNativeDriver: nativo }).start();
    },
  };
}

/** Valor de 0 al número pedido, para animar rellenos (anillo, barras). */
export function useLlenado(destino: number, duracion = 900, retraso = 120) {
  const v = useRef(new Animated.Value(reducido ? destino : 0)).current;
  useEffect(() => {
    if (reducido) {
      v.setValue(destino);
      return;
    }
    const a = Animated.timing(v, { toValue: destino, duration: duracion, delay: retraso, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [v, destino, duracion, retraso]);
  return v;
}

/** Número que cuenta desde 0 hasta `valor` (coma decimal, como en la app). */
export function NumeroAnimado({ valor, decimales = 0, estilo, children }: {
  valor: number; decimales?: number; estilo?: StyleProp<TextStyle>; children?: ReactNode;
}) {
  const v = useLlenado(valor, 900);
  const [mostrado, setMostrado] = useState(reducido ? valor : 0);
  useEffect(() => {
    const id = v.addListener(({ value }) => setMostrado(value));
    return () => v.removeListener(id);
  }, [v]);
  const n = Math.abs(mostrado - valor) < 1e-6 ? valor : mostrado;
  const texto = decimales ? n.toFixed(decimales).replace('.', ',') : String(Math.round(n));
  return (
    <Text style={estilo} accessibilityLabel={String(valor).replace('.', ',')}>
      {texto}
      {children}
    </Text>
  );
}
