import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Pantalla, Tarjeta, s } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { colores, espacio } from '../../tema';

export default function Inicio() {
  const { perfil } = useSesion();
  const primerNombre = perfil?.nombre?.split(' ')[0];

  return (
    <Pantalla>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.l }}>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{primerNombre ? `Hola, ${primerNombre}` : 'Hola'}</Text>
          <Text style={s.sub}>Este es tu resumen de la semana</Text>
        </View>
        <Link href="/perfil" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir mi perfil" style={{ padding: espacio.s }}>
            <Text style={{ color: colores.primario, fontWeight: '600' }}>Perfil</Text>
          </Pressable>
        </Link>
      </View>

      <Tarjeta>
        <Text style={s.seccion}>Progreso de carrera</Text>
        <Text style={{ fontSize: 15, color: colores.textoSuave }}>
          Cuando marques tus materias aprobadas en "Mi carrera", acá vas a ver tu avance y tu promedio.
        </Text>
      </Tarjeta>
      <Tarjeta>
        <Text style={s.seccion}>Próximos exámenes</Text>
        <Text style={{ fontSize: 15, color: colores.textoSuave }}>Todavía no cargaste exámenes.</Text>
      </Tarjeta>
      <Tarjeta>
        <Text style={s.seccion}>Avisos del CEQ</Text>
        <Text style={{ fontSize: 15, color: colores.textoSuave }}>No hay avisos nuevos.</Text>
      </Tarjeta>
    </Pantalla>
  );
}
