import Ionicons from '@expo/vector-icons/Ionicons';
import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { type ComponentProps } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { colores, fondos, fuentes, sombras } from '../tema';
import { vibrar } from './movimiento';

type Icono = ComponentProps<typeof Ionicons>['name'];

/** Ícono de cada pestaña (sin "-outline"; el contorno se usa cuando no está elegida). */
export const ICONOS_PESTANAS: Record<string, string> = {
  index: 'home',
  carrera: 'school',
  firma: 'calculator',
  agenda: 'calendar',
  ceq: 'people',
};

export const ANCHO_BARRA_LATERAL = 104;

/**
 * Barra de pestañas propia: la pastilla celeste detrás del ícono sigue al
 * dedo mientras se desliza entre páginas (lee `position` del deslizador),
 * así no hay saltos ni la página anterior asomando. Abajo en el celular y
 * a la izquierda en tablet horizontal.
 */
export function BarraPestanas({ state, descriptors, emitter, jumpTo, position, insets, lateral }: MaterialTopTabBarProps & { lateral: boolean }) {
  const abajo = Math.max(insets.bottom, 6);
  return (
    <View
      accessibilityRole="tablist"
      style={[
        { backgroundColor: fondos.superficieBlanca, ...sombras.media },
        lateral
          ? { position: 'absolute', left: -ANCHO_BARRA_LATERAL, top: 0, bottom: 0, width: ANCHO_BARRA_LATERAL, paddingTop: insets.top + 12, gap: 6 }
          : { flexDirection: 'row', height: 62 + abajo, paddingTop: 6, paddingBottom: abajo, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key];
        const titulo = typeof options.title === 'string' ? options.title : route.name;
        const elegida = state.index === i;
        // 1 en la página propia y 0 en las vecinas, con todos los valores intermedios al deslizar.
        const cerca = position.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [0, 1, 0], extrapolate: 'clamp' });
        const base = ICONOS_PESTANAS[route.name] ?? 'ellipse';
        const tocar = () => {
          const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          vibrar();
          if (!elegida && !ev.defaultPrevented) jumpTo(route.key);
        };
        return (
          <Pressable
            key={route.key}
            onPress={tocar}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            accessibilityRole="tab"
            accessibilityState={{ selected: elegida }}
            accessibilityLabel={titulo}
            style={lateral ? { alignItems: 'center', paddingVertical: 8 } : { flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: 56, height: 32, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View
                style={{
                  position: 'absolute', width: 56, height: 32, borderRadius: 16, backgroundColor: fondos.cielo,
                  opacity: cerca, transform: [{ scaleX: cerca.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
                }}
              />
              {/* Contorno y relleno superpuestos: el relleno aparece a medida que la página llega. */}
              <Animated.View style={{ position: 'absolute', opacity: cerca.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
                <Ionicons name={`${base}-outline` as Icono} color={colores.textoSuave} size={21} />
              </Animated.View>
              <Animated.View style={{ opacity: cerca, transform: [{ scale: cerca.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
                <Ionicons name={base as Icono} color={colores.marino} size={21} />
              </Animated.View>
            </View>
            <Text
              numberOfLines={1}
              style={{ fontFamily: elegida ? fuentes.bold : fuentes.semibold, fontSize: 11, marginTop: 3, color: elegida ? colores.marino : colores.textoSuave }}
            >
              {titulo}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
