import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { cuandoAhora, cuandoDesde, estadoNotificacion, resolverCuando, SelectorCarrera, SelectorCuando, VistaPrevia, type Cuando } from '../../components/admin';
import { BarraSuperior, Boton, Campo, Cargando, Fila, Insignia, Mensaje, Pantalla, Seccion, Tarjeta } from '../../components/ui';
import { borrarAviso, cargarAvisosAdmin, cargarCarreras, guardarAviso, notificacionDeAviso } from '../../datos/admin';
import { LIMITE_AVISO, LIMITE_TITULO, TITULO_RECOMENDADO, validarMensaje } from '../../lib/programacion';
import type { AvisoDb, Carrera, NotificacionDb } from '../../lib/tipos-db';
import { colores, espacio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin/avisos'));

export default function EditarAviso() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editando = Boolean(id);
  const [cargando, setCargando] = useState(editando);
  const [original, setOriginal] = useState<AvisoDb | null>(null);
  const [notif, setNotif] = useState<NotificacionDb | null>(null);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [imagen, setImagen] = useState('');
  const [carrera, setCarrera] = useState<string | null>(null);
  const [cuando, setCuando] = useState<Cuando>(cuandoAhora());
  const [notificar, setNotificar] = useState(true);
  const [visible, setVisible] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargarCarreras().then(setCarreras).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const lista = await cargarAvisosAdmin();
      const a = lista.find((x) => x.id === id) ?? null;
      setOriginal(a);
      if (a) {
        setTitulo(a.titulo);
        setCuerpo(a.cuerpo);
        setImagen(a.imagen_url ?? '');
        setCarrera(a.carrera_id ?? null);
        setCuando(cuandoDesde(a.publicar_en));
        setNotificar(a.notificar);
        setVisible(a.publicado);
        setNotif(await notificacionDeAviso(a.id));
      }
    })()
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el aviso.'))
      .finally(() => setCargando(false));
  }, [id]);

  const yaEnviada = notif?.estado === 'enviada';
  const yaPublicado = Boolean(original && new Date(original.publicar_en ?? original.created_at) <= new Date());

  const guardar = async () => {
    setError(null);
    const e = validarMensaje(titulo, cuerpo, { limiteCuerpo: LIMITE_AVISO });
    if (e) return setError(e);
    const img = imagen.trim();
    if (img && !/^https:\/\/\S+$/i.test(img)) return setError('La imagen tiene que ser un enlace que empiece con https://');
    const r = resolverCuando(cuando);
    if ('error' in r) return setError(r.error);
    // Un aviso que ya salió conserva su fecha original al editarlo.
    const publicarEn = cuando.modo === 'ahora' && yaPublicado && original ? (original.publicar_en ?? original.created_at) : r.fecha.toISOString();
    setGuardando(true);
    try {
      await guardarAviso(id ?? null, {
        titulo: titulo.trim(), cuerpo: cuerpo.trim(), imagen_url: img || null, notificar, publicado: visible, publicar_en: publicarEn, carrera_id: carrera,
      });
      volver();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!id) return;
    if (!confirmarBorrar) return setConfirmarBorrar(true);
    setGuardando(true);
    try {
      await borrarAviso(id);
      volver();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar.');
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Editar aviso" onVolver={volver} />
        <Cargando />
      </Pantalla>
    );
  }

  const estado = notif ? estadoNotificacion(notif.estado, notif.destinatarios, notif.enviada_en ?? notif.programada_para) : null;
  let textoBoton = 'Guardar cambios';
  if (!editando) textoBoton = cuando.modo === 'programar' ? 'Programar aviso' : notificar ? 'Publicar y notificar' : 'Publicar';

  return (
    <Pantalla>
      <BarraSuperior titulo={editando ? 'Editar aviso' : 'Nuevo aviso'} onVolver={volver} />

      {estado && (
        <View style={{ flexDirection: 'row', marginBottom: espacio.m }}>
          <Insignia texto={`Notificación: ${estado.texto}`} color={estado.color} fondo={estado.fondo} icono="notifications" />
        </View>
      )}

      <Campo
        etiqueta="Título"
        value={titulo}
        onChangeText={setTitulo}
        maxLength={LIMITE_TITULO}
        placeholder="Ej.: Asamblea general del CEQ"
        ayuda={titulo.length > TITULO_RECOMENDADO ? 'En la notificación se puede cortar: mejor un título corto.' : undefined}
      />
      <Campo etiqueta="Texto" value={cuerpo} onChangeText={setCuerpo} multiline placeholder="Qué, cuándo y dónde." />
      <Campo etiqueta="Imagen (opcional)" value={imagen} onChangeText={setImagen} placeholder="https://…" autoCapitalize="none" keyboardType="url" ayuda="Enlace a una imagen ya publicada (por ejemplo, la de Instagram o la web)." />

      <SelectorCarrera carreras={carreras} valor={carrera} onCambio={setCarrera} mostrarAlcance={notificar} />

      <Seccion>Cuándo se publica</Seccion>
      <SelectorCuando valor={cuando} onCambio={setCuando} textoAhora={editando && yaPublicado ? 'Ya publicado' : 'Ahora'} />

      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila
          icono="notifications-outline"
          titulo="Enviar notificación"
          detalle={yaEnviada ? 'Ya se envió: editar el aviso no la vuelve a mandar.' : 'Les llega al celular cuando se publica.'}
          derecha={<Switch value={notificar} onValueChange={setNotificar} disabled={yaEnviada} accessibilityLabel="Enviar notificación" trackColor={{ true: colores.marino, false: colores.linea }} thumbColor={colores.blanco} />}
          ultima={!editando}
        />
        {editando && (
          <Fila
            icono="eye-outline"
            titulo="Visible en la app"
            detalle="Apagalo para ocultar el aviso sin borrarlo."
            derecha={<Switch value={visible} onValueChange={setVisible} accessibilityLabel="Visible en la app" trackColor={{ true: colores.marino, false: colores.linea }} thumbColor={colores.blanco} />}
            ultima
          />
        )}
      </Tarjeta>

      {notificar && !yaEnviada && <VistaPrevia titulo={titulo} cuerpo={cuerpo} />}

      <Mensaje texto={error} />
      <Boton texto={textoBoton} icono={cuando.modo === 'programar' ? 'time' : 'send'} onPress={guardar} cargando={guardando} />
      {editando && (
        <>
          {confirmarBorrar && <Mensaje texto="¿Seguro? El aviso desaparece de la app para todos. Tocá de nuevo para borrarlo." />}
          <Boton texto={confirmarBorrar ? 'Sí, borrar' : 'Borrar aviso'} variante="peligro" icono="trash-outline" onPress={borrar} deshabilitado={guardando} estilo={{ marginTop: espacio.m }} />
        </>
      )}
      <Text style={{ height: espacio.xl }} />
    </Pantalla>
  );
}
