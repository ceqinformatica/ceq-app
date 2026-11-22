import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { BarraSuperior, BotonFlotante, Campo, Cargando, EstadoVacio, Insignia, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { cargarTramitesAdmin } from '../../datos/tramites';
import { usarDatos } from '../../datos/usarDatos';
import { agruparPorCategoria, filtrarTramites } from '../../lib/tramites';
import { colores, espacio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

export default function TramitesAdmin() {
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarTramitesAdmin, []);
  const [busqueda, setBusqueda] = useState('');
  const grupos = useMemo(() => agruparPorCategoria(filtrarTramites(datos ?? [], busqueda)), [datos, busqueda]);

  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Guía de trámites" onVolver={volver} />
        <Text style={[s.filaDetalle, { marginBottom: espacio.m }]}>
          Lo que edites acá lo ven todos los estudiantes al instante. Revisá fechas y aranceles al empezar cada semestre.
        </Text>
        <Campo etiqueta="Buscar" value={busqueda} onChangeText={setBusqueda} placeholder="Nombre o palabra" autoCorrect={false} />
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.length ? (
          <EstadoVacio
            icono="document-text-outline"
            titulo={error ? 'No pudimos cargar los trámites' : 'Todavía no hay trámites'}
            texto={error ?? 'Cargá el primero con el botón +.'}
            accion={{ texto: 'Nuevo trámite', onPress: () => router.push('/admin/tramite') }}
          />
        ) : !grupos.length ? (
          <EstadoVacio icono="search-outline" titulo="No encontramos ese trámite" texto="Probá con otra palabra." />
        ) : (
          grupos.map((g) => (
            <View key={g.categoria}>
              <Seccion>{`${g.categoria} (${g.tramites.length})`}</Seccion>
              {g.tramites.map((t) => (
                <Tarjeta key={t.id} onPress={() => router.push(`/admin/tramite?id=${t.id}`)} etiqueta={`Editar ${t.nombre}`}>
                  {!t.publicado && (
                    <View style={{ flexDirection: 'row', marginBottom: espacio.s }}>
                      <Insignia texto="Oculto" color={colores.gris} fondo={colores.grisFondo} icono="eye-off-outline" />
                    </View>
                  )}
                  <Text style={[s.filaTitulo, { color: colores.marino }]}>{t.nombre}</Text>
                  {t.plazo ? <Text style={[s.filaDetalle, { marginTop: 4 }]} numberOfLines={1}>{t.plazo}</Text> : null}
                </Tarjeta>
              ))}
            </View>
          ))
        )}
        <View style={{ height: 72 }} />
      </Pantalla>
      <BotonFlotante etiqueta="Nuevo trámite" onPress={() => router.push('/admin/tramite')} />
    </View>
  );
}
