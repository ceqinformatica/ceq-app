import { router } from 'expo-router';
import { Text } from 'react-native';
import { BarraSuperior, Cargando, EstadoVacio, Pantalla, s, Tarjeta } from '../components/ui';
import { cargarAvisos, haceCuanto } from '../datos/ceq';
import { usarDatos } from '../datos/usarDatos';
import { colores, fuentes } from '../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/ceq'));

export default function Avisos() {
  const { datos, cargando, error, refrescando, recargar } = usarDatos(() => cargarAvisos(50), []);
  return (
    <Pantalla refrescando={refrescando} onRefrescar={recargar}>
      <BarraSuperior titulo="Avisos del CEQ" onVolver={volver} />
      {cargando && !datos ? (
        <Cargando />
      ) : !datos?.length ? (
        <EstadoVacio icono="megaphone-outline" titulo={error ? 'No pudimos cargar los avisos' : 'Sin avisos por ahora'} texto={error ?? 'Cuando el CEQ publique algo, lo vas a ver acá.'} />
      ) : (
        datos.map((a) => (
          <Tarjeta key={a.id} onPress={() => router.push(`/aviso/${a.id}`)} etiqueta={a.titulo}>
            <Text style={{ fontFamily: fuentes.semibold, fontSize: 11, color: colores.azul, letterSpacing: 0.4, marginBottom: 4, textTransform: 'uppercase' }}>{haceCuanto(a.publicar_en ?? a.created_at)}</Text>
            <Text style={[s.filaTitulo, { fontSize: 16, color: colores.marino }]}>{a.titulo}</Text>
            <Text style={[s.filaDetalle, { marginTop: 4 }]} numberOfLines={3}>{a.cuerpo}</Text>
          </Tarjeta>
        ))
      )}
    </Pantalla>
  );
}
