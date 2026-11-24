import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { BarraSuperior, BotonFlotante, Cargando, EstadoVacio, Insignia, Mensaje, Pantalla, s, Tarjeta } from '../../components/ui';
import { useTema } from '../../context/TemaProvider';
import { usarDatos } from '../../datos/usarDatos';
import { cargarVentanasAdmin } from '../../datos/ventanas';
import { describirCuando } from '../../lib/programacion';
import type { VentanaDb } from '../../lib/tipos-db';
import { coloresVentana, vigente } from '../../lib/ventanas';
import { colores, espacio, fondos, radio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

const FRECUENCIA: Record<string, string> = { una_vez: 'Una vez', diaria: 'Una vez por día', siempre: 'Cada vez que abre la app' };

function estado(v: VentanaDb) {
  const ahora = new Date();
  if (!v.activa) return { texto: 'Apagada', color: colores.gris, fondo: fondos.grisFondo };
  if (new Date(v.desde) > ahora) return { texto: `Programada · ${describirCuando(v.desde)}`, color: colores.amarillo, fondo: fondos.amarilloFondo };
  if (v.hasta && new Date(v.hasta) <= ahora) return { texto: 'Terminó', color: colores.gris, fondo: fondos.grisFondo };
  return vigente(v, ahora) ? { texto: v.hasta ? `Visible hasta ${describirCuando(v.hasta).toLowerCase()}` : 'Visible', color: colores.marino, fondo: fondos.tarjeta } : { texto: 'Apagada', color: colores.gris, fondo: fondos.grisFondo };
}

/** Ventanas flotantes que ven los estudiantes al abrir la app. */
export default function VentanasAdmin() {
  useTema();
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarVentanasAdmin, []);
  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Ventanas flotantes" onVolver={volver} />
        <Mensaje tipo="info" texto="Carteles que aparecen sobre la app: un anuncio, una invitación, un aviso importante. Elegís el texto, la imagen, el botón, los colores, la forma, para quién y cuándo." />
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.length ? (
          <EstadoVacio
            icono="albums-outline"
            titulo={error ? 'No pudimos cargar las ventanas' : 'Todavía no hay ventanas'}
            texto={error ?? 'Creá la primera: la ven al abrir la app.'}
            accion={{ texto: 'Nueva ventana', onPress: () => router.push('/admin/ventana') }}
          />
        ) : (
          datos.map((v) => {
            const e = estado(v);
            const c = coloresVentana(v.color);
            return (
              <Tarjeta key={v.id} onPress={() => router.push(`/admin/ventana?id=${v.id}`)} etiqueta={`Editar ${v.titulo}`}>
                <View style={{ flexDirection: 'row', gap: espacio.m, alignItems: 'flex-start' }}>
                  <View style={{ width: 36, height: 36, borderRadius: radio.m, backgroundColor: c.fondo, borderWidth: 1, borderColor: colores.linea }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.s }}>
                      <Insignia texto={e.texto} color={e.color} fondo={e.fondo} />
                      <Insignia texto={FRECUENCIA[v.frecuencia] ?? v.frecuencia} icono="repeat" color={colores.gris} fondo={fondos.grisFondo} />
                    </View>
                    <Text style={[s.filaTitulo, { fontSize: 16, color: colores.marino }]}>{v.titulo}</Text>
                    {v.cuerpo ? <Text style={[s.filaDetalle, { marginTop: 2 }]} numberOfLines={2}>{v.cuerpo}</Text> : null}
                  </View>
                </View>
              </Tarjeta>
            );
          })
        )}
        <View style={{ height: 72 }} />
      </Pantalla>
      <BotonFlotante icono="add" etiqueta="Nueva ventana" onPress={() => router.push('/admin/ventana')} />
    </View>
  );
}
