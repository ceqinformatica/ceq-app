import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Boton, CabeceraMarca, Dato, Fila, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { cargarPendientes, cargarResumen } from '../../datos/admin';
import { usarDatos } from '../../datos/usarDatos';
import { colores, espacio } from '../../tema';
import { useTema } from '../../context/TemaProvider';

export default function PanelAdmin() {
  useTema();
  const { datos, error, refrescando, recargar } = usarDatos(async () => {
    const [resumen, pendientes] = await Promise.all([cargarResumen(), cargarPendientes()]);
    return { ...resumen, pendientes };
  }, []);
  const carnets = datos?.pendientes?.carnets_pendientes ?? 0;
  const n = (v: number | undefined) => (v == null ? '…' : String(v));
  return (
    <Pantalla cabecera={<CabeceraMarca titulo="Panel del CEQ" sub="Solo lo ven las cuentas de administración" compacta />} refrescando={refrescando} onRefrescar={recargar}>
      <Tarjeta estilo={{ marginTop: -espacio.l }}>
        <View style={{ flexDirection: 'row', gap: espacio.m }}>
          <Dato valor={n(datos?.usuarios)} etiqueta="Estudiantes" />
          <Dato valor={n(datos?.celulares)} etiqueta="Celulares con avisos" />
          <Dato valor={n(datos?.programadas)} etiqueta="Programadas" color={colores.azul} />
        </View>
      </Tarjeta>
      <Mensaje texto={error} />
      {carnets > 0 && (
        <Tarjeta variante="celeste" onPress={() => router.push('/admin/solicitudes-carnet')} etiqueta="Revisar carnets por validar">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m }}>
            <Ionicons name="camera" size={22} color={colores.marino} />
            <View style={{ flex: 1 }}>
              <Text style={s.filaTitulo}>{carnets === 1 ? '1 carnet para validar' : `${carnets} carnets para validar`}</Text>
              <Text style={s.filaDetalle}>Te llega una notificación cada vez que alguien manda uno.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colores.textoSuave} />
          </View>
        </Tarjeta>
      )}

      <View style={{ flexDirection: 'row', gap: espacio.m, marginBottom: espacio.l }}>
        <Boton texto="Nuevo aviso" icono="megaphone" onPress={() => router.push('/admin/aviso')} estilo={{ flex: 1 }} compacto />
        <Boton texto="Notificar" icono="notifications" variante="secundario" onPress={() => router.push('/admin/notificaciones?nueva=1')} estilo={{ flex: 1 }} compacto />
      </View>

      <Seccion>Gestionar</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila icono="camera-outline" titulo="Validar carnets" detalle={carnets ? `${carnets} por revisar` : 'Revisar las fotos de carnets físicos que mandaron los estudiantes'} onPress={() => router.push('/admin/solicitudes-carnet')} />
        <Fila icono="card-outline" titulo="Socios y carnets" detalle="Dar de alta a quien pagó, renovar o dar de baja" onPress={() => router.push('/admin/socios')} />
        <Fila icono="qr-code-outline" titulo="Verificar carnet" detalle="Escanear el QR de un socio en la puerta o en un comercio" onPress={() => router.push('/verificar')} />
        <Fila icono="megaphone-outline" titulo="Avisos" detalle="Publicar, programar y editar comunicados" onPress={() => router.push('/admin/avisos')} />
        <Fila icono="notifications-outline" titulo="Notificaciones" detalle="Recordatorios y mensajes al celular, ahora o programados" onPress={() => router.push('/admin/notificaciones')} />
        <Fila icono="stats-chart-outline" titulo="Encuestas" detalle="Crear encuestas anónimas y ver resultados" onPress={() => router.push('/admin/encuestas')} />
        <Fila icono="school-outline" titulo="Horarios de finales" detalle={datos?.pendientes?.horarios_borrador ? `${datos.pendientes.horarios_borrador} en borrador` : 'Subir el PDF de cada carrera y repartir las fechas'} onPress={() => router.push('/admin/horarios-finales')} />
        <Fila icono="albums-outline" titulo="Ventanas flotantes" detalle={datos?.pendientes?.ventanas_activas ? `${datos.pendientes.ventanas_activas} visibles ahora` : 'Carteles que aparecen al abrir la app, a tu gusto'} onPress={() => router.push('/admin/ventanas')} />
        <Fila icono="time-outline" titulo="Horarios de clases" detalle={datos?.pendientes?.clases_borrador ? `${datos.pendientes.clases_borrador} en borrador` : 'Subir el PDF de cada carrera para que carguen sus clases'} onPress={() => router.push('/admin/horarios-clases')} />
        <Fila icono="calendar-outline" titulo="Calendario académico" detalle="Fechas de inscripción, finales, aranceles y feriados" onPress={() => router.push('/admin/calendario')} />
        <Fila icono="document-text-outline" titulo="Guía de trámites" detalle="Editar pasos, requisitos, plazos y costos" onPress={() => router.push('/admin/tramites')} />
        <Fila
          icono="chatbubbles-outline"
          titulo="Sugerencias"
          detalle={datos?.sugerencias_nuevas ? `${datos.sugerencias_nuevas} sin leer` : 'Leer y responder lo que mandan los estudiantes'}
          onPress={() => router.push('/admin/sugerencias')}
          ultima
        />
      </Tarjeta>

      <Mensaje
        tipo="info"
        texto="Los recordatorios de parciales, finales y entregas salen solos: a cada estudiante le llega un aviso antes de cada fecha que carga en su agenda."
      />
      <Boton texto="Volver a la app" variante="fantasma" icono="arrow-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Pantalla>
  );
}
