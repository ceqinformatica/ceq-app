import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Movimiento de la app: entradas suaves, rebote al tocar, números que
 * cuentan y una vibración leve. Todo respeta "Reducir movimiento" del
 * teléfono: si está activado, las cosas aparecen directamente.
 */

/** Curva de salida fuerte para lo que entra o responde al toque. */
export const CURVA_SALIDA = Easing.bezier(0.23, 1, 0.32, 1);
/** Curva de las hojas de iOS (abrir y cerrar). */
export const CURVA_HOJA = Easing.bezier(0.32, 0.72, 0, 1);

let reducido = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((r) => { reducido = r; })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (r) => { reducido = r; });

/** true si el teléfono pide reducir el movimiento (último valor conocido). */
export const movimientoReducido = () => reducido;

/**
 * Lo mismo como estado de React: la primera lectura del sistema es
 * asíncrona, así que una pantalla que ya empezó a animar se detiene y
 * queda en su lugar en cuanto se sabe que hay que reducir el movimiento.
 */
function useReducido() {
  const [r, setR] = useState(reducido);
  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((x) => { reducido = x; if (vivo) setR(x); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (x) => { reducido = x; setR(x); });
    return () => { vivo = false; sub?.remove(); };
  }, []);
  return r;
}

/** Vibración corta al tocar algo importante (no hace nada en la web). */
export function vibrar(tipo: 'toque' | 'exito' = 'toque') {
  if (Platform.OS === 'web') return;
  const p = tipo === 'exito' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.selectionAsync();
  p.catch(() => {});
}

/** Estilo animado de entrada (opacidad y desplazamiento), para combinar con otros. */
export function useAparecer(retraso = 0, distancia = 8) {
  const r = useReducido();
  const v = useRef(new Animated.Value(reducido ? 1 : 0)).current;
  useEffect(() => {
    if (r) {
      v.stopAnimation();
      v.setValue(1);
      return;
    }
    const a = Animated.timing(v, { toValue: 1, duration: 360, delay: retraso, easing: CURVA_SALIDA, useNativeDriver: Platform.OS !== 'web' });
    a.start();
    return () => a.stop();
  }, [v, retraso, r]);
  return { opacity: v, translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distancia, 0] }) };
}

/** Aparece subiendo un poco y ganando opacidad. `retraso` en ms para escalonar. */
export function Aparecer({ children, retraso = 0, estilo, distancia = 8 }: {
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
      // Respuesta inmediata al apoyar el dedo (curva de salida fuerte, 120 ms).
      Animated.timing(escala, { toValue: hasta, duration: 120, easing: CURVA_SALIDA, useNativeDriver: nativo }).start();
    },
    onPressOut: () => {
      if (reducido) return;
      // Vuelve con un resorte casi sin rebote, como los botones de iOS.
      Animated.spring(escala, { toValue: 1, stiffness: 420, damping: 30, mass: 1, useNativeDriver: nativo }).start();
    },
  };
}

/** Valor de 0 al número pedido, para animar rellenos (anillo, barras). */
export function useLlenado(destino: number, duracion = 900, retraso = 120) {
  const r = useReducido();
  const v = useRef(new Animated.Value(reducido ? destino : 0)).current;
  useEffect(() => {
    if (r) {
      v.stopAnimation();
      v.setValue(destino);
      return;
    }
    const a = Animated.timing(v, { toValue: destino, duration: duracion, delay: retraso, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [v, destino, duracion, retraso, r]);
  return v;
}

/** Número que cuenta desde 0 hasta `valor` (coma decimal, como en la app). */
export function NumeroAnimado({ valor, decimales = 0, estilo, sufijo = '', children }: {
  valor: number; decimales?: number; estilo?: StyleProp<TextStyle>;
  /** Lo que se lee después del número (ej. "%"), para el lector de pantalla. */
  sufijo?: string; children?: ReactNode;
}) {
  const v = useLlenado(valor, 900);
  const [mostrado, setMostrado] = useState(reducido ? valor : 0);
  useEffect(() => {
    const id = v.addListener(({ value }) => setMostrado(value));
    return () => v.removeListener(id);
  }, [v]);
  const formato = (x: number) => (decimales ? x.toFixed(decimales).replace('.', ',') : String(Math.round(x)));
  const n = Math.abs(mostrado - valor) < 1e-6 ? valor : mostrado;
  return (
    <Text style={estilo} accessibilityLabel={`${formato(valor)}${sufijo}`}>
      {formato(n)}
      {children}
    </Text>
  );
}

/**
 * Para ventanas flotantes (Modal con animationType="none"): el velo se
 * funde y la ventana entra por su cuenta, en vez de deslizar todo junto.
 * `montado` sigue en true mientras corre la salida, para que se vea cerrar.
 * `progreso` va de 0 (cerrada) a 1 (abierta).
 */
export function useEntradaFlotante(visible: boolean) {
  const r = useReducido();
  const progreso = useRef(new Animated.Value(0)).current;
  const [montado, setMontado] = useState(visible);
  useEffect(() => {
    const nativo = Platform.OS !== 'web';
    if (visible) {
      setMontado(true);
      if (r) { progreso.setValue(1); return; }
      // Resorte críticamente amortiguado (sin pasarse), con la respuesta de las hojas de iOS.
      const a = Animated.spring(progreso, { toValue: 1, stiffness: 320, damping: 36, mass: 1, overshootClamping: true, useNativeDriver: nativo });
      a.start();
      return () => a.stop();
    }
    if (r) { progreso.setValue(0); setMontado(false); return; }
    let vivo = true;
    const a = Animated.timing(progreso, { toValue: 0, duration: 240, easing: CURVA_HOJA, useNativeDriver: nativo });
    a.start(({ finished }) => { if (finished && vivo) setMontado(false); });
    return () => { vivo = false; a.stop(); };
  }, [visible, r, progreso]);
  return { montado, progreso };
}
