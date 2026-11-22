import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { BarraSuperior, BotonFlotante, Cargando, EstadoVacio, Insignia, Pantalla, s, Tarjeta } from '../../components/ui';
import { cargarAvisosAdmin } from '../../datos/admin';
import { usarDatos } from '../../datos/usarDatos';
import { describirCuando } from '../../lib/programacion';
import type { AvisoDb } from '../../lib/tipos-db';
import { colores, espacio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

function estadoAviso(a: AvisoDb) {
  if (!a.publicado) return { texto: 'Oculto', color: colores.gris, fondo: colores.grisFondo };
  const cuando = a.publicar_en ?? a.created_at;
  if (new Date(cuando) > new Date()) return { texto: `Programado · ${describirCuando(cuando)}`, color: colores.amarillo, fondo: colores.amarilloFondo };
  return { texto: `Publicado · ${describirCuando(cuando)}`, color: colores.verde, fondo: colores.verdeFondo };
}

export default function AvisosAdmin() {
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarAvisosAdmin, []);
  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Avisos" onVolver={volver} />
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.length ? (
          <EstadoVacio
            icono="megaphone-outline"
            titulo={error ? 'No pudimos cargar los avisos' : 'Todavía no hay avisos'}
            texto={error ?? 'Publicá el primero: le llega a todos como notificación.'}
            accion={{ texto: 'Nuevo aviso', onPress: () => router.push('/admin/aviso') }}
          />
        ) : (
          datos.map((a) => {
            const e = estadoAviso(a);
            return (
              <Tarjeta key={a.id} onPress={() => router.push(`/admin/aviso?id=${a.id}`)} etiqueta={`Editar ${a.titulo}`}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.s }}>
                  <Insignia texto={e.texto} color={e.color} fondo={e.fondo} />
                  {a.notificar && <Insignia texto="Con notificación" icono="notifications" />}
                </View>
                <Text style={[s.filaTitulo, { fontSize: 16, color: colores.marino }]}>{a.titulo}</Text>
                <Text style={[s.filaDetalle, { marginTop: 4 }]} numberOfLines={2}>{a.cuerpo}</Text>
              </Tarjeta>
            );
          })
        )}
        <View style={{ height: 72 }} />
      </Pantalla>
      <BotonFlotante etiqueta="Nuevo aviso" onPress={() => router.push('/admin/aviso')} />
    </View>
  );
}
