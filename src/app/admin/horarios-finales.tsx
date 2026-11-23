import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { BarraSuperior, BotonFlotante, Cargando, EstadoVacio, Insignia, Mensaje, Pantalla, s, Tarjeta } from '../../components/ui';
import { useTema } from '../../context/TemaProvider';
import { cargarCarreras } from '../../datos/admin';
import { cargarHorariosAdmin } from '../../datos/finales-oficiales';
import { usarDatos } from '../../datos/usarDatos';
import { describirCuando } from '../../lib/programacion';
import type { Carrera } from '../../lib/tipos-db';
import { colores, espacio, fondos } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

/** Horarios de finales cargados: publicados y borradores. */
export default function HorariosFinalesAdmin() {
  useTema();
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarHorariosAdmin, []);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  useEffect(() => {
    cargarCarreras().then(setCarreras).catch(() => {});
  }, []);
  const nombre = (id: string) => carreras.find((c) => c.id === id)?.nombre ?? 'Carrera';

  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Horarios de finales" onVolver={volver} />
        <Mensaje
          tipo="info"
          texto="Subí el PDF que publica la Dirección Académica (uno por carrera). La app detecta la carrera, las materias, los llamados, las fechas y las horas; lo revisás y al publicarlo les llega a los estudiantes de esa carrera."
        />
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.length ? (
          <EstadoVacio
            icono="document-text-outline"
            titulo={error ? 'No pudimos cargar los horarios' : 'Todavía no hay horarios cargados'}
            texto={error ?? 'Cuando salga el anteproyecto de finales, subí el PDF de cada carrera.'}
            accion={{ texto: 'Subir PDF', onPress: () => router.push('/admin/horario-finales') }}
          />
        ) : (
          datos.map((h) => (
            <Tarjeta key={h.id} onPress={() => router.push(`/admin/horario-finales?id=${h.id}`)} etiqueta={`Abrir ${h.titulo}`}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.s }}>
                {h.publicado ? (
                  <Insignia texto={`Publicado · ${describirCuando(h.publicado_en ?? h.updated_at)}`} icono="eye-outline" />
                ) : (
                  <Insignia texto="Borrador: no lo ven los estudiantes" color={colores.gris} fondo={fondos.grisFondo} icono="create-outline" />
                )}
                {h.pdf_path ? <Insignia texto="Con PDF" icono="document-attach-outline" color={colores.gris} fondo={fondos.grisFondo} /> : null}
              </View>
              <Text style={[s.filaTitulo, { fontSize: 16, color: colores.marino }]}>{nombre(h.carrera_id)}</Text>
              <Text style={[s.filaDetalle, { marginTop: 2 }]}>{h.titulo}</Text>
            </Tarjeta>
          ))
        )}
        <View style={{ height: 72 }} />
      </Pantalla>
      <BotonFlotante icono="cloud-upload-outline" etiqueta="Subir PDF" onPress={() => router.push('/admin/horario-finales')} />
    </View>
  );
}
