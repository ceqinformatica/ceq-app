import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Encabezado, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { colores, espacio } from '../../tema';

function Vacio({ icono, texto }: { icono: React.ComponentProps<typeof Ionicons>['name']; texto: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m }}>
      <Ionicons name={icono} size={22} color={colores.marino} />
      <Text style={[s.cuerpo, { flex: 1 }]}>{texto}</Text>
    </View>
  );
}

export default function Inicio() {
  const { perfil } = useSesion();
  const primerNombre = perfil?.nombre?.split(' ')[0];

  return (
    <Pantalla>
      <Encabezado
        derecha={
          <Link href="/perfil" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Abrir mi perfil" hitSlop={8}>
              <Ionicons name="person-circle-outline" size={32} color={colores.marino} />
            </Pressable>
          </Link>
        }
      />

      <View style={{ backgroundColor: colores.cielo, borderRadius: 16, padding: espacio.l, marginBottom: espacio.l }}>
        <Text style={[s.titulo, { fontSize: 22, lineHeight: 27 }]}>{primerNombre ? `Hola, ${primerNombre}` : 'Hola'}</Text>
        <Text style={s.sub}>Este es tu resumen de la semana</Text>
      </View>

      <Seccion>Progreso de carrera</Seccion>
      <Tarjeta>
        <Vacio icono="school-outline" texto='Marcá tus materias aprobadas en "Mi carrera" para ver tu avance y tu promedio.' />
      </Tarjeta>

      <Seccion>Próximos exámenes</Seccion>
      <Tarjeta>
        <Vacio icono="calendar-outline" texto="Todavía no cargaste exámenes." />
      </Tarjeta>

      <Seccion>Avisos del CEQ</Seccion>
      <Tarjeta>
        <Vacio icono="megaphone-outline" texto="No hay avisos nuevos." />
      </Tarjeta>
    </Pantalla>
  );
}
