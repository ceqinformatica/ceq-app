import { router } from 'expo-router';
import { View } from 'react-native';
import { Boton, CabeceraMarca, Dato, Fila, Mensaje, Pantalla, Seccion, Tarjeta } from '../../components/ui';
import { cargarResumen } from '../../datos/admin';
import { usarDatos } from '../../datos/usarDatos';
import { colores, espacio } from '../../tema';
import { useTema } from '../../context/TemaProvider';

export default function PanelAdmin() {
  useTema();
  const { datos, error, refrescando, recargar } = usarDatos(cargarResumen, []);
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

      <View style={{ flexDirection: 'row', gap: espacio.m, marginBottom: espacio.l }}>
        <Boton texto="Nuevo aviso" icono="megaphone" onPress={() => router.push('/admin/aviso')} estilo={{ flex: 1 }} compacto />
        <Boton texto="Notificar" icono="notifications" variante="secundario" onPress={() => router.push('/admin/notificaciones?nueva=1')} estilo={{ flex: 1 }} compacto />
      </View>

      <Seccion>Gestionar</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila icono="camera-outline" titulo="Validar carnets" detalle="Revisar las fotos de carnets físicos que mandaron los estudiantes" onPress={() => router.push('/admin/solicitudes-carnet')} />
        <Fila icono="card-outline" titulo="Socios y carnets" detalle="Dar de alta a quien pagó, renovar o dar de baja" onPress={() => router.push('/admin/socios')} />
        <Fila icono="qr-code-outline" titulo="Verificar carnet" detalle="Escanear el QR de un socio en la puerta o en un comercio" onPress={() => router.push('/verificar')} />
        <Fila icono="megaphone-outline" titulo="Avisos" detalle="Publicar, programar y editar comunicados" onPress={() => router.push('/admin/avisos')} />
        <Fila icono="notifications-outline" titulo="Notificaciones" detalle="Recordatorios y mensajes al celular, ahora o programados" onPress={() => router.push('/admin/notificaciones')} />
        <Fila icono="stats-chart-outline" titulo="Encuestas" detalle="Crear encuestas anónimas y ver resultados" onPress={() => router.push('/admin/encuestas')} />
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
