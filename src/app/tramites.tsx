import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { BarraSuperior, Campo, Cargando, Chip, EstadoVacio, Fila, Mensaje, Pantalla, Seccion, Tarjeta } from '../components/ui';
import { cargarTramites } from '../datos/tramites';
import { usarDatos } from '../datos/usarDatos';
import { agruparPorCategoria, filtrarTramites } from '../lib/tramites';
import { espacio } from '../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/ceq'));

export default function Tramites() {
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarTramites, []);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);

  const categorias = useMemo(() => agruparPorCategoria(datos ?? []).map((g) => g.categoria), [datos]);
  const grupos = useMemo(() => agruparPorCategoria(filtrarTramites(datos ?? [], busqueda, categoria)), [datos, busqueda, categoria]);

  return (
    <Pantalla refrescando={refrescando} onRefrescar={recargar}>
      <BarraSuperior titulo="Trámites de la FCQ" onVolver={volver} />
      <Campo
        etiqueta="Buscar"
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Ej.: certificado, final, beca"
        returnKeyType="search"
        autoCorrect={false}
      />
      {categorias.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espacio.s, paddingBottom: espacio.m }}>
          <Chip texto="Todos" elegido={categoria == null} onPress={() => setCategoria(null)} />
          {categorias.map((c) => <Chip key={c} texto={c} elegido={categoria === c} onPress={() => setCategoria(categoria === c ? null : c)} />)}
        </ScrollView>
      )}

      {cargando && !datos ? (
        <Cargando />
      ) : !datos?.length ? (
        <EstadoVacio icono="document-text-outline" titulo={error ? 'No pudimos cargar los trámites' : 'Todavía no hay trámites cargados'} texto={error ?? undefined} />
      ) : !grupos.length ? (
        <EstadoVacio icono="search-outline" titulo="No encontramos ese trámite" texto="Probá con otra palabra o escribinos desde Sugerencias." />
      ) : (
        grupos.map((g) => (
          <View key={g.categoria}>
            <Seccion>{g.categoria}</Seccion>
            <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
              {g.tramites.map((t, i) => (
                <Fila
                  key={t.id}
                  icono="document-text-outline"
                  titulo={t.nombre}
                  detalle={t.descripcion ?? undefined}
                  onPress={() => router.push(`/tramite/${t.id}`)}
                  ultima={i === g.tramites.length - 1}
                />
              ))}
            </Tarjeta>
          </View>
        ))
      )}

      <Mensaje
        tipo="info"
        texto="Datos sacados de qui.una.py (formularios, calendario académico y reglamentos). Las fechas y aranceles cambian cada año: ante la duda, confirmá en la Mesa de Entrada o la Dirección Académica."
      />
      <View style={{ height: espacio.xl }} />
    </Pantalla>
  );
}
