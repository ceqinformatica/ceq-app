import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';
import { useEffect, useRef, type ComponentProps } from 'react';
import { Animated, Easing, Platform, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDisposicion } from '../../components/disposicion';
import { movimientoReducido, vibrar } from '../../components/movimiento';
import { colores, fondos, fuentes, sombras } from '../../tema';
import { useTema } from '../../context/TemaProvider';

type Icono = ComponentProps<typeof Ionicons>['name'];

/**
 * Ícono relleno cuando la pestaña está activa, con una pastilla celeste
 * detrás que se abre y un pequeño salto del ícono al elegirla.
 */
const icono = (base: string) =>
  function IconoPestana({ color, focused }: { color: ColorValue; focused: boolean }) {
    const pastilla = useRef(new Animated.Value(focused ? 1 : 0)).current;
    const salto = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      const nativo = Platform.OS !== 'web';
      if (movimientoReducido()) {
        pastilla.setValue(focused ? 1 : 0);
        return;
      }
      Animated.spring(pastilla, { toValue: focused ? 1 : 0, speed: 18, bounciness: 6, useNativeDriver: nativo }).start();
      if (focused) {
        salto.setValue(0);
        Animated.sequence([
          Animated.timing(salto, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: nativo }),
          Animated.spring(salto, { toValue: 0, speed: 14, bounciness: 12, useNativeDriver: nativo }),
        ]).start();
      }
    }, [focused, pastilla, salto]);
    return (
      <View style={{ width: 52, height: 30, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute', width: 52, height: 30, borderRadius: 15, backgroundColor: fondos.cielo,
            opacity: pastilla, transform: [{ scaleX: pastilla.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          }}
        />
        <Animated.View style={{ transform: [{ translateY: salto.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }, { scale: salto.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>
          <Ionicons name={(focused ? base : `${base}-outline`) as Icono} color={color as string} size={21} />
        </Animated.View>
      </View>
    );
  };

export default function TabsLayout() {
  useTema();
  const insets = useSafeAreaInsets();
  const abajo = Math.max(insets.bottom, Platform.OS === 'web' ? 8 : 6);
  // Tablet en horizontal: las pestañas van en una barra a la izquierda.
  const { barraLateral } = useDisposicion();
  return (
    <Tabs
      screenListeners={{ tabPress: () => vibrar() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.marino,
        tabBarInactiveTintColor: colores.textoSuave,
        tabBarPosition: barraLateral ? 'left' : 'bottom',
        tabBarVariant: barraLateral ? 'material' : 'uikit',
        tabBarLabelPosition: 'below-icon',
        tabBarActiveBackgroundColor: 'transparent',
        tabBarStyle: barraLateral
          ? { backgroundColor: fondos.superficieBlanca, borderRightWidth: 0, width: 104, paddingTop: insets.top + 12, ...sombras.media }
          : {
              backgroundColor: fondos.superficieBlanca,
              borderTopWidth: 0,
              height: 62 + abajo,
              paddingTop: 6,
              paddingBottom: abajo,
              ...sombras.media,
            },
        tabBarLabelStyle: { fontFamily: fuentes.semibold, fontSize: 11, marginTop: 2 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icono('home') }} />
      <Tabs.Screen name="carrera" options={{ title: 'Mi carrera', tabBarIcon: icono('school') }} />
      <Tabs.Screen name="firma" options={{ title: 'Firma', tabBarIcon: icono('calculator') }} />
      <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: icono('calendar') }} />
      <Tabs.Screen name="ceq" options={{ title: 'CEQ', tabBarIcon: icono('people') }} />
    </Tabs>
  );
}
