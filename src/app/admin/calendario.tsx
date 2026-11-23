import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { FilaCalendario } from '../../components/calendario';
import { BarraSuperior, BotonFlotante, Cargando, EstadoVacio, Mensaje, Pantalla, Seccion, Segmentado, Tarjeta } from '../../components/ui';
import { useTema } from '../../context/TemaProvider';
import { cargarCalendario } from '../../datos/calendario';
import { usarDatos } from '../../datos/usarDatos';
import { hoyPy, momento, porMes } from '../../lib/calendario';
import { espacio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

/** Panel: editar el calendario académico que ven todos. */
export default function AdminCalendario() {
  useTema();
  const { datos, cargando, error, refrescando, recargar } = usarDatos(() => cargarCalendario(false), []);
  const [vista, setVista] = useState<'proximas' | 'todas'>('proximas');
  const hoy = hoyPy();
  const meses = useMemo(() => porMes((datos ?? []).filter((e) => vista === 'todas' || momento(e, hoy) !== 'pasado')), [datos, vista, hoy]);

  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Calendario académico" onVolver={volver} />
        <Mensaje tipo="info" texto="Lo que cambies acá lo ven todos al instante. Cuando la FCQ publique el calendario nuevo, cargá sus fechas con Nueva fecha." />
        <Segmentado opciones={[{ valor: 'proximas', texto: 'Por delante' }, { valor: 'todas', texto: 'Todas' }]} valor={vista} onCambio={setVista} />
        {cargando && !datos ? (
          <Cargando />
        ) : error && !datos ? (
          <EstadoVacio icono="cloud-offline-outline" titulo="No pudimos cargar el calendario" texto={error} accion={{ texto: 'Reintentar', onPress: recargar }} />
        ) : meses.length === 0 ? (
          <EstadoVacio icono="calendar-clear-outline" titulo="No hay fechas cargadas" texto="Agregá las del calendario nuevo con Nueva fecha." />
        ) : (
          meses.map((m) => (
            <View key={m.clave}>
              <Seccion>{m.titulo}</Seccion>
              <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
                {m.eventos.map((e, i) => (
                  <FilaCalendario key={e.id} e={e} hoy={hoy} ultima={i === m.eventos.length - 1} onPress={() => router.push(`/admin/fecha?id=${e.id}`)} />
                ))}
              </Tarjeta>
            </View>
          ))
        )}
        <View style={{ height: 72 }} />
      </Pantalla>
      <BotonFlotante etiqueta="Nueva fecha" onPress={() => router.push('/admin/fecha')} />
    </View>
  );
}
