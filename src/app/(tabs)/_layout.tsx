import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { colores, fuentes } from '../../tema';

type Icono = ComponentProps<typeof Ionicons>['name'];
const icono = (nombre: Icono) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={nombre} color={color as string} size={size} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.marino,
        tabBarInactiveTintColor: colores.textoSuave,
        tabBarStyle: { backgroundColor: colores.blanco, borderTopColor: colores.linea },
        tabBarLabelStyle: { fontFamily: fuentes.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icono('home-outline') }} />
      <Tabs.Screen name="carrera" options={{ title: 'Mi carrera', tabBarIcon: icono('school-outline') }} />
      <Tabs.Screen name="firma" options={{ title: 'Firma', tabBarIcon: icono('calculator-outline') }} />
      <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: icono('calendar-outline') }} />
      <Tabs.Screen name="ceq" options={{ title: 'CEQ', tabBarIcon: icono('people-outline') }} />
    </Tabs>
  );
}
