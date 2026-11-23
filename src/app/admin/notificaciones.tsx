import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { cuandoAhora, estadoNotificacion, resolverCuando, SelectorCarrera, SelectorCuando, VistaPrevia, type Cuando } from '../../components/admin';
import { BarraSuperior, Boton, BotonFlotante, Campo, Cargando, Chip, EstadoVacio, Hoja, Insignia, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { cancelarNotificacion, cargarCarreras, cargarNotificaciones, programarNotificacion } from '../../datos/admin';
import { usarDatos } from '../../datos/usarDatos';
import { LIMITE_CUERPO, LIMITE_TITULO, TITULO_RECOMENDADO, validarMensaje } from '../../lib/programacion';
import type { Carrera, NotificacionDb } from '../../lib/tipos-db';
import { espacio } from '../../tema';
import { useTema } from '../../context/TemaProvider';
import { textoError } from '../../lib/errores';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

/** Pantalla que abre la notificación al tocarla. */
const DESTINOS = [
  { ruta: '/', texto: 'Inicio' },
  { ruta: '/agenda', texto: 'Agenda' },
  { ruta: '/avisos', texto: 'Avisos' },
  { ruta: '/ceq', texto: 'CEQ' },
  { ruta: '/carrera', texto: 'Mi carrera' },
];

const TIPOS: Record<string, string> = { aviso: 'Aviso', mensaje: 'Mensaje', recordatorio: 'Fecha oficial' };

export default function NotificacionesAdmin() {
  useTema();
  const { nueva } = useLocalSearchParams<{ nueva?: string }>();
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarNotificaciones, []);
  const [abierta, setAbierta] = useState(nueva === '1');
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    cargarCarreras().then(setCarreras).catch(() => {});
  }, []);

  const programadas = (datos ?? []).filter((n) => n.estado === 'pendiente').sort((a, b) => a.programada_para.localeCompare(b.programada_para));
  const historial = (datos ?? []).filter((n) => n.estado !== 'pendiente');

  const cancelar = async (n: NotificacionDb) => {
    setCancelando(n.id);
    try {
      await cancelarNotificacion(n.id);
      await recargar();
    } catch (e) {
      setAviso(textoError(e, 'No se pudo cancelar.'));
    } finally {
      setCancelando(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Notificaciones" onVolver={volver} />
        <Mensaje tipo="exito" texto={aviso} />
        {cargando && !datos ? (
          <Cargando />
        ) : (
          <>
            <Seccion>Programadas</Seccion>
            {programadas.length ? (
              programadas.map((n) => (
                <Item key={n.id} n={n}>
                  {n.tipo === 'aviso' ? (
                    <Text style={[s.filaDetalle, { marginTop: espacio.s }]}>Se cancela editando u ocultando el aviso.</Text>
                  ) : (
                    <Boton texto="Cancelar envío" variante="peligro" compacto icono="close" onPress={() => cancelar(n)} cargando={cancelando === n.id} estilo={{ marginTop: espacio.m, alignSelf: 'flex-start' }} />
                  )}
                </Item>
              ))
            ) : (
              <Tarjeta><EstadoVacio icono="time-outline" titulo="Nada programado" texto="Programá un recordatorio para que salga solo el día y la hora que elijas." /></Tarjeta>
            )}

            <Seccion estilo={{ marginTop: espacio.l }}>Historial</Seccion>
            {error && <Mensaje texto={error} />}
            {historial.length ? historial.map((n) => <Item key={n.id} n={n} />) : <Text style={s.filaDetalle}>Todavía no se envió nada.</Text>}
          </>
        )}
        <View style={{ height: 72 }} />
      </Pantalla>
      <BotonFlotante icono="notifications" etiqueta="Nueva notificación" onPress={() => setAbierta(true)} />
      <Formulario
        visible={abierta}
        carreras={carreras}
        onCerrar={() => setAbierta(false)}
        onListo={(texto) => {
          setAbierta(false);
          setAviso(texto);
          recargar();
        }}
      />
    </View>
  );
}

function Item({ n, children }: { n: NotificacionDb; children?: React.ReactNode }) {
  const e = estadoNotificacion(n.estado, n.destinatarios, n.estado === 'enviada' ? (n.enviada_en ?? n.programada_para) : n.programada_para);
  return (
    <Tarjeta>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.s }}>
        <Insignia texto={e.texto} color={e.color} fondo={e.fondo} />
        <Insignia texto={TIPOS[n.tipo] ?? n.tipo} />
      </View>
      <Text style={s.filaTitulo}>{n.titulo}</Text>
      <Text style={[s.filaDetalle, { marginTop: 2 }]} numberOfLines={3}>{n.cuerpo}</Text>
      {children}
    </Tarjeta>
  );
}

function Formulario({ visible, carreras, onCerrar, onListo }: { visible: boolean; carreras: Carrera[]; onCerrar: () => void; onListo: (texto: string) => void }) {
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [carrera, setCarrera] = useState<string | null>(null);
  const [ruta, setRuta] = useState('/');
  const [cuando, setCuando] = useState<Cuando>(cuandoAhora());
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limpiar = () => {
    setTitulo('');
    setCuerpo('');
    setCarrera(null);
    setRuta('/');
    setCuando(cuandoAhora());
    setConfirmar(false);
    setError(null);
  };

  const enviar = async () => {
    setError(null);
    const e = validarMensaje(titulo, cuerpo);
    if (e) return setError(e);
    const r = resolverCuando(cuando);
    if ('error' in r) return setError(r.error);
    // Lo que sale ya no se puede deshacer: pedir un segundo toque.
    if (cuando.modo === 'ahora' && !confirmar) return setConfirmar(true);
    setEnviando(true);
    try {
      await programarNotificacion({ titulo: titulo.trim(), cuerpo: cuerpo.trim(), programada_para: r.fecha.toISOString(), carrera_id: carrera, ruta });
      limpiar();
      onListo(cuando.modo === 'ahora' ? 'Listo: sale en menos de un minuto.' : 'Listo: quedó programada.');
    } catch (err) {
      setError(textoError(err, 'No se pudo enviar.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo="Nueva notificación" onCerrar={onCerrar}>
      <Campo
        etiqueta="Título"
        value={titulo}
        onChangeText={(t) => { setTitulo(t); setConfirmar(false); }}
        maxLength={LIMITE_TITULO}
        placeholder="Ej.: Cierra la inscripción a finales"
        ayuda={titulo.length > TITULO_RECOMENDADO ? 'En el celular se puede cortar: mejor un título corto.' : undefined}
      />
      <Campo etiqueta="Texto" value={cuerpo} onChangeText={(t) => { setCuerpo(t); setConfirmar(false); }} maxLength={LIMITE_CUERPO} multiline placeholder="Ej.: Hoy a las 23:59 cierra la inscripción del 1.er periodo." />
      <SelectorCarrera carreras={carreras} valor={carrera} onCambio={(c) => { setCarrera(c); setConfirmar(false); }} />
      <Text style={s.etiqueta}>Al tocarla abre</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.l }}>
        {DESTINOS.map((d) => <Chip key={d.ruta} texto={d.texto} elegido={ruta === d.ruta} onPress={() => setRuta(d.ruta)} />)}
      </View>
      <Text style={s.etiqueta}>Cuándo sale</Text>
      <SelectorCuando valor={cuando} onCambio={(c) => { setCuando(c); setConfirmar(false); }} />
      <VistaPrevia titulo={titulo} cuerpo={cuerpo} />
      <Mensaje texto={error} />
      {confirmar && <Mensaje tipo="info" texto="Una vez enviada no se puede borrar de los celulares. Tocá de nuevo para confirmar." />}
      <Boton
        texto={cuando.modo === 'programar' ? 'Programar' : confirmar ? 'Sí, enviar ahora' : 'Enviar ahora'}
        icono={cuando.modo === 'programar' ? 'time' : 'send'}
        onPress={enviar}
        cargando={enviando}
      />
    </Hoja>
  );
}
