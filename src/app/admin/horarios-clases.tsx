import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { BarraSuperior, BotonFlotante, Cargando, EstadoVacio, Insignia, Mensaje, Pantalla, s, Tarjeta } from '../../components/ui';
import { useTema } from '../../context/TemaProvider';
import { cargarCarreras } from '../../datos/admin';
import { cargarHorariosClasesAdmin, faltaMigracion } from '../../datos/horarios-clases';
import { usarDatos } from '../../datos/usarDatos';
import { describirCuando } from '../../lib/programacion';
import type { Carrera } from '../../lib/tipos-db';
import { colores, espacio, fondos } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

/** Horarios de clases cargados: publicados y borradores. */
export default function HorariosClasesAdmin() {
  useTema();
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarHorariosClasesAdmin, []);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  useEffect(() => {
    cargarCarreras().then(setCarreras).catch(() => {});
  }, []);
  const nombre = (id: string) => carreras.find((c) => c.id === id)?.nombre ?? 'Carrera';
  const sinTabla = Boolean(error && faltaMigracion(error));

  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Horarios de clases" onVolver={volver} />
        <Mensaje
          tipo="info"
          texto="Subí el PDF del horario de clases de cada carrera, aunque esté escaneado. La app lee la carrera, el plan, el nivel, las materias, los días, las horas y las aulas; lo revisás y al publicarlo los estudiantes cargan sus clases a la agenda con un toque."
        />
        {sinTabla ? <Mensaje texto="Falta aplicar en Supabase la migración de horarios de clases (20261124070000_horarios_clases.sql)." /> : null}
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.length ? (
          <EstadoVacio
            icono="time-outline"
            titulo={error ? 'No pudimos cargar los horarios' : 'Todavía no hay horarios de clases'}
            texto={error ?? 'Cuando la facultad publique el horario del periodo, subí el PDF de cada carrera.'}
            accion={sinTabla ? undefined : { texto: 'Subir PDF', onPress: () => router.push('/admin/horario-clases') }}
          />
        ) : (
          datos.map((h) => (
            <Tarjeta key={h.id} onPress={() => router.push(`/admin/horario-clases?id=${h.id}`)} etiqueta={`Abrir ${h.titulo}`}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.s }}>
                {h.publicado ? (
                  <Insignia texto={`Publicado · ${describirCuando(h.publicado_en ?? h.updated_at)}`} icono="eye-outline" />
                ) : (
                  <Insignia texto="Borrador: no lo ven los estudiantes" color={colores.gris} fondo={fondos.grisFondo} icono="create-outline" />
                )}
                {h.plan_anio ? <Insignia texto={`Plan ${h.plan_anio}`} icono="school-outline" color={colores.gris} fondo={fondos.grisFondo} /> : null}
              </View>
              <Text style={[s.filaTitulo, { fontSize: 16, color: colores.marino }]}>{nombre(h.carrera_id)}</Text>
              <Text style={[s.filaDetalle, { marginTop: 2 }]}>{h.titulo}</Text>
            </Tarjeta>
          ))
        )}
        <View style={{ height: 72 }} />
      </Pantalla>
      {!sinTabla && <BotonFlotante icono="cloud-upload-outline" etiqueta="Subir PDF" onPress={() => router.push('/admin/horario-clases')} />}
    </View>
  );
}
