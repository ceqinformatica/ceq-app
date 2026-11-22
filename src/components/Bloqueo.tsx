import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSesion } from '../context/SesionProvider';
import { salir } from '../lib/auth';
import { colores, espacio } from '../tema';
import { Boton, Mensaje } from './ui';

export function Bloqueo() {
  const { desbloquear } = useSesion();
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
    <View style={{ flex: 1, justifyContent: 'center', padding: espacio.xl, backgroundColor: colores.fondo }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: colores.texto, textAlign: 'center' }}>App bloqueada</Text>
      <Text style={{ fontSize: 15, color: colores.textoSuave, textAlign: 'center', marginVertical: espacio.m }}>
        Usá tu huella o tu rostro para entrar.
      </Text>
      <Mensaje texto={error} />
      <Boton texto="Desbloquear" onPress={intentar} />
      <Boton texto="Cerrar sesión" variante="secundario" onPress={salir} />
    </View>
  );
}
