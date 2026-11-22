import { router, useLocalSearchParams } from 'expo-router';
import { Image, Text, View } from 'react-native';
import { BarraSuperior, Cargando, EstadoVacio, Pantalla, s } from '../../components/ui';
import { cargarAviso, haceCuanto } from '../../datos/ceq';
import { usarDatos } from '../../datos/usarDatos';
import { colores, espacio, fuentes, radio, texto } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/avisos'));

export default function Aviso() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { datos: aviso, cargando, error } = usarDatos(() => cargarAviso(id ?? ''), [id]);
  return (
    <Pantalla>
      <BarraSuperior titulo="Aviso" onVolver={volver} />
      {cargando && !aviso ? (
        <Cargando />
      ) : !aviso ? (
        <EstadoVacio icono="megaphone-outline" titulo="Este aviso ya no está disponible" texto={error ?? undefined} />
      ) : (
        <View>
          <Text style={{ fontFamily: fuentes.semibold, fontSize: 12, color: colores.azul, letterSpacing: 0.6, textTransform: 'uppercase' }}>{haceCuanto(aviso.created_at)}</Text>
          <Text style={[texto.titulo, { color: colores.marino, marginTop: espacio.xs, marginBottom: espacio.l }]} accessibilityRole="header">{aviso.titulo}</Text>
          {aviso.imagen_url ? (
            <Image source={{ uri: aviso.imagen_url }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radio.l, marginBottom: espacio.l, backgroundColor: colores.tarjeta }} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : null}
          <Text style={[s.cuerpo, { fontSize: 16, lineHeight: 25 }]} selectable>{aviso.cuerpo}</Text>
        </View>
      )}
    </Pantalla>
  );
}
