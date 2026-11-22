import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import { Platform, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colores, fuentes, sombras } from '../../tema';

type Icono = ComponentProps<typeof Ionicons>['name'];

/** Ícono relleno cuando la pestaña está activa, con una pastilla celeste detrás. */
const icono = (base: string) =>
  function IconoPestana({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <View style={{ width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colores.cielo : 'transparent' }}>
        <Ionicons name={(focused ? base : `${base}-outline`) as Icono} color={color as string} size={21} />
      </View>
    );
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const abajo = Math.max(insets.bottom, Platform.OS === 'web' ? 8 : 6);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.marino,
        tabBarInactiveTintColor: colores.textoSuave,
        tabBarStyle: {
          backgroundColor: colores.superficieBlanca,
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
