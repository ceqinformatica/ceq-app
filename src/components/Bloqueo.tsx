import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSesion } from '../context/SesionProvider';
import { salir } from '../lib/auth';
import { colores, espacio, fondos, fuentes } from '../tema';
import { Hexagono } from './graficos';
import { Boton, logoCeq, Mensaje } from './ui';

export function Bloqueo() {
  const { desbloquear } = useSesion();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);

  const intentar = async () => {
    setError(null);
    if (!(await desbloquear())) setError('No se pudo verificar. Probá de nuevo.');
  };

  useEffect(() => {
    intentar();
    // Solo al mostrar la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      style={{ flex: 1, backgroundColor: fondos.celesteMarca, paddingTop: insets.top, paddingBottom: insets.bottom + espacio.xl, paddingHorizontal: espacio.xl }}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Hexagono tamano={112} relleno={fondos.blanco}>
          <Image source={logoCeq} style={{ width: 76, height: 76 }} accessibilityLabel="Logo del CEQ" />
        </Hexagono>
        <Text style={{ fontFamily: fuentes.bold, fontSize: 24, color: colores.blanco, marginTop: espacio.xl, textTransform: 'uppercase', letterSpacing: 1 }} accessibilityRole="header">
          App bloqueada
        </Text>
        <Text style={{ fontFamily: fuentes.regular, fontSize: 15, color: '#FFFFFF', marginTop: espacio.s, textAlign: 'center' }}>
          Usá tu huella o tu rostro para entrar.
        </Text>
        <Pressable onPress={intentar} accessibilityRole="button" accessibilityLabel="Desbloquear" style={({ pressed }) => ({ marginTop: espacio.xxl, width: 84, height: 84, borderRadius: 42, backgroundColor: pressed ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(203,226,250,0.5)' })}>
          <Ionicons name="finger-print" size={44} color={colores.blanco} />
        </Pressable>
      </View>
      <Mensaje texto={error} />
      <Boton texto="Desbloquear" variante="claro" onPress={intentar} />
      <Pressable onPress={salir} accessibilityRole="button" style={{ alignSelf: 'center', padding: espacio.m, marginTop: espacio.s }}>
        <Text style={{ fontFamily: fuentes.semibold, fontSize: 14, color: '#FFFFFF' }}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}
