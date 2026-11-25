import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { cuandoAhora, cuandoDesde, resolverCuando, SelectorCarrera, SelectorCuando, type Cuando } from '../../components/admin';
import { Columnas } from '../../components/disposicion';
import { CampoFechaHora, hoy } from '../../components/fecha';
import { BarraSuperior, Boton, Campo, Cargando, Chip, Contador, Fila, Mensaje, Pantalla, s, Seccion, Segmentado, Tarjeta, type NombreIcono } from '../../components/ui';
import { TarjetaVentana } from '../../components/Ventana';
import { useTema } from '../../context/TemaProvider';
import { cargarCarreras } from '../../datos/admin';
import { borrarVentana, cargarVentanasAdmin, guardarVentana, subirImagenVentana } from '../../datos/ventanas';
import { textoError } from '../../lib/errores';
import { leerFechaHora, partesDe } from '../../lib/programacion';
import type { Carrera, FormaVentana, FrecuenciaVentana, VentanaDb } from '../../lib/tipos-db';
import { COLOR_TEMA, colorValido, coloresVentana, esColorPropio, esColorTema, LIMITE_BOTON_VENTANA, LIMITE_CUERPO_VENTANA, LIMITE_TITULO_VENTANA, PALETA_VENTANA, validarVentana } from '../../lib/ventanas';
import { colores, espacio, fondos, radio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin/ventanas'));

const ICONOS: NombreIcono[] = ['megaphone', 'school', 'calendar', 'notifications', 'information-circle', 'alert-circle', 'gift', 'star', 'heart', 'people', 'card', 'ticket', 'flask', 'trophy'];
const DESTINOS = [
  { ruta: '/', texto: 'Inicio' }, { ruta: '/agenda', texto: 'Agenda' }, { ruta: '/carrera', texto: 'Mi carrera' }, { ruta: '/firma', texto: 'Firma' },
  { ruta: '/ceq', texto: 'CEQ' }, { ruta: '/avisos', texto: 'Avisos' }, { ruta: '/calendario', texto: 'Calendario' },
  { ruta: '/finales-fechas', texto: 'Fechas de finales' }, { ruta: '/tramites', texto: 'Trámites' }, { ruta: '/carnet', texto: 'Carnet' },
];
const DURACIONES = [
  { texto: 'Sin fin', dias: 0 }, { texto: '1 día', dias: 1 }, { texto: '1 semana', dias: 7 }, { texto: '1 mes', dias: 30 },
];

/** Crear o editar una ventana flotante, con vista previa en vivo. */
export default function EditarVentana() {
  const { oscuro } = useTema();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editando = Boolean(id);
  const [cargando, setCargando] = useState(editando);
  const [original, setOriginal] = useState<VentanaDb | null>(null);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [imagen, setImagen] = useState('');
  const [icono, setIcono] = useState('');
  const [botonTexto, setBotonTexto] = useState('');
  const [destino, setDestino] = useState('');
  const [web, setWeb] = useState(false);
  const [color, setColor] = useState<string>(COLOR_TEMA);
  // La vista previa se puede ver en modo claro u oscuro (las ventanas "según el tema" cambian).
  const [previaOscuro, setPreviaOscuro] = useState<boolean | null>(null);
  const [hex, setHex] = useState('');
  const [forma, setForma] = useState<FormaVentana>('centro');
  const [alineacion, setAlineacion] = useState<'izquierda' | 'centro'>('centro');
  const [donde, setDonde] = useState<'inicio' | 'todas'>('inicio');
  const [frecuencia, setFrecuencia] = useState<FrecuenciaVentana>('una_vez');
  const [cerrable, setCerrable] = useState(true);
  const [carrera, setCarrera] = useState<string | null>(null);
  const [cuando, setCuando] = useState<Cuando>(cuandoAhora());
  const [conFin, setConFin] = useState(false);
  const [finFecha, setFinFecha] = useState('');
  const [finHora, setFinHora] = useState('23:59');
  const [prioridad, setPrioridad] = useState(0);
  const [activa, setActiva] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [previa, setPrevia] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargarCarreras().then(setCarreras).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    cargarVentanasAdmin()
      .then((l) => {
        const v = l.find((x) => x.id === id) ?? null;
        setOriginal(v);
        if (!v) return setError('Esa ventana ya no existe.');
        setTitulo(v.titulo);
        setCuerpo(v.cuerpo);
        setImagen(v.imagen_url ?? '');
        setIcono(v.icono ?? '');
        setBotonTexto(v.boton_texto ?? '');
        setDestino(v.boton_destino ?? '');
        setWeb(Boolean(v.boton_destino?.startsWith('https://')));
        if (esColorPropio(v.color)) {
          setColor('propio');
          setHex(v.color);
        } else setColor(v.color);
        setForma(v.forma);
        setAlineacion(v.alineacion);
        setDonde(v.donde);
        setFrecuencia(v.frecuencia);
        setCerrable(v.cerrable);
        setCarrera(v.carrera_id);
        setCuando(cuandoDesde(v.desde));
        setConFin(Boolean(v.hasta));
        if (v.hasta) {
          const p = partesDe(new Date(v.hasta));
          setFinFecha(p.fecha);
          setFinHora(p.hora);
        }
        setPrioridad(v.prioridad);
        setActiva(v.activa);
      })
      .catch((e) => setError(textoError(e, 'No se pudo cargar la ventana.')))
      .finally(() => setCargando(false));
  }, [id]);

  const colorFinal = color === 'propio' ? hex.trim().toUpperCase() : color;

  const subirImagen = async () => {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 5 * 1024 * 1024) return setError('La imagen pesa más de 5 MB.');
    setSubiendo(true);
    try {
      setImagen(await subirImagenVentana(a.uri, a.mimeType ?? undefined));
    } catch (e) {
      setError(textoError(e, 'No se pudo subir la imagen.'));
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async () => {
    setError(null);
    const e = validarVentana({ titulo, cuerpo, imagen_url: imagen, icono, boton_texto: botonTexto, boton_destino: destino, color: colorFinal, cerrable });
    if (e) return setError(e);
    const r = resolverCuando(cuando);
    if ('error' in r) return setError(r.error);
    // Una ventana que ya empezó conserva su fecha de inicio al editarla.
    const yaEmpezo = original && new Date(original.desde) <= new Date();
    const desde = cuando.modo === 'ahora' && yaEmpezo ? original!.desde : r.fecha.toISOString();
    let hasta: string | null = null;
    if (conFin) {
      const f = leerFechaHora(finFecha, finHora || '23:59');
      if ('error' in f) return setError(`Hasta cuándo: ${f.error}`);
      if (f.fecha <= new Date(desde)) return setError('El final tiene que ser después del inicio.');
      hasta = f.fecha.toISOString();
    }
    setGuardando(true);
    try {
      await guardarVentana(id ?? null, {
        titulo: titulo.trim(), cuerpo: cuerpo.trim(), imagen_url: imagen.trim() || null, icono: icono || null,
        boton_texto: botonTexto.trim() || null, boton_destino: destino.trim() || null, color: colorFinal, forma, alineacion, donde, frecuencia,
        cerrable, carrera_id: carrera, desde, hasta, activa, prioridad,
      });
      volver();
    } catch (err) {
      setError(textoError(err, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!id) return;
    if (!confirmarBorrar) return setConfirmarBorrar(true);
    setGuardando(true);
    try {
      await borrarVentana(id);
      volver();
    } catch (err) {
      setError(textoError(err, 'No se pudo borrar.'));
      setGuardando(false);
    }
  };

  const fijarDuracion = (dias: number) => {
    if (!dias) return setConFin(false);
    const r = resolverCuando(cuando);
    const base = 'fecha' in r ? r.fecha : new Date();
    const fin = new Date(base.getTime() + dias * 86_400_000);
    const p = partesDe(fin);
    setConFin(true);
    setFinFecha(p.fecha);
    setFinHora(p.hora);
  };

  if (cargando) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Editar ventana" onVolver={volver} />
        <Cargando />
      </Pantalla>
    );
  }

  const dibujo = {
    titulo, cuerpo, imagen_url: /^https:\/\/\S+$/.test(imagen.trim()) ? imagen.trim() : null, icono: icono || null,
    boton_texto: botonTexto.trim() || null, boton_destino: destino || null, color: colorValido(colorFinal) ? colorFinal : COLOR_TEMA,
    forma, alineacion, cerrable,
  };

  const verOscuro = previaOscuro ?? oscuro;
  const cPrevia = coloresVentana(dibujo.color, verOscuro);

  const contenido = (
    <>
      <Seccion>Contenido</Seccion>
      <Campo etiqueta="Título" value={titulo} onChangeText={setTitulo} maxLength={LIMITE_TITULO_VENTANA} placeholder="Ej.: ¡Fiesta de bienvenida!" />
      <Campo etiqueta="Texto (opcional)" value={cuerpo} onChangeText={setCuerpo} maxLength={LIMITE_CUERPO_VENTANA} multiline placeholder="Qué, cuándo y dónde." />

      <Text style={s.etiqueta}>Imagen (opcional)</Text>
      <View style={{ flexDirection: 'row', gap: espacio.s, marginBottom: espacio.s }}>
        <Boton texto={imagen ? 'Cambiar imagen' : 'Subir imagen'} icono="image-outline" variante="secundario" compacto onPress={subirImagen} cargando={subiendo} estilo={{ flex: 1 }} />
        {imagen ? <Boton texto="Quitar" icono="close" variante="fantasma" compacto onPress={() => setImagen('')} /> : null}
      </View>
      <Campo etiqueta="o enlace a una imagen" value={imagen} onChangeText={setImagen} placeholder="https://…" autoCapitalize="none" keyboardType="url" />

      {!imagen && (
        <>
          <Text style={s.etiqueta}>Ícono</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
            <Chip texto="Sin ícono" elegido={!icono} onPress={() => setIcono('')} />
            {ICONOS.map((i) => (
              <Pressable
                key={i}
                onPress={() => setIcono(i)}
                accessibilityRole="button"
                accessibilityLabel={`Ícono ${i}`}
                accessibilityState={{ selected: icono === i }}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: icono === i ? fondos.marino : fondos.tarjeta }}
              >
                <Ionicons name={i} size={20} color={icono === i ? colores.blanco : colores.marino} />
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Seccion>Botón (opcional)</Seccion>
      <Campo etiqueta="Texto del botón" value={botonTexto} onChangeText={setBotonTexto} maxLength={LIMITE_BOTON_VENTANA} placeholder="Ej.: Ver más" />
      {botonTexto.trim() ? (
        <>
          <Text style={s.etiqueta}>Al tocarlo abre</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
            {DESTINOS.map((d) => <Chip key={d.ruta} texto={d.texto} elegido={!web && destino === d.ruta} onPress={() => { setWeb(false); setDestino(d.ruta); }} />)}
            <Chip texto="Página web" icono="globe-outline" elegido={web} onPress={() => { setWeb(true); setDestino(destino.startsWith('https://') ? destino : 'https://'); }} />
          </View>
          {web && <Campo etiqueta="Enlace" value={destino} onChangeText={setDestino} placeholder="https://…" autoCapitalize="none" keyboardType="url" />}
        </>
      ) : null}

      <Seccion>Colores</Seccion>
      <Pressable
        onPress={() => setColor(COLOR_TEMA)}
        accessibilityRole="radio"
        accessibilityState={{ checked: esColorTema(color) }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m, padding: espacio.m, borderRadius: radio.l, marginBottom: espacio.m, backgroundColor: fondos.superficieBlanca, borderWidth: esColorTema(color) ? 2 : 1, borderColor: esColorTema(color) ? colores.marino : colores.linea }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: colores.linea }}>
          <View style={{ flex: 1, backgroundColor: coloresVentana(COLOR_TEMA, false).fondo }} />
          <View style={{ flex: 1, backgroundColor: coloresVentana(COLOR_TEMA, true).fondo }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.filaTitulo, { color: colores.texto }]}>Según el tema del usuario</Text>
          <Text style={s.filaDetalle}>Clara para quien usa el modo claro y oscura para quien usa el modo oscuro. Recomendado.</Text>
        </View>
        <Ionicons name={esColorTema(color) ? 'radio-button-on' : 'radio-button-off'} size={22} color={esColorTema(color) ? colores.marino : colores.textoSuave} />
      </Pressable>
      <Text style={s.etiqueta}>O un color fijo (se ve igual en los dos modos)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {Object.entries(PALETA_VENTANA).map(([k, p]) => (
          <Pressable key={k} onPress={() => setColor(k)} accessibilityRole="button" accessibilityLabel={`Color ${p.nombre}`} accessibilityState={{ selected: color === k }} style={{ alignItems: 'center', gap: 4, width: 58 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.fondo, borderWidth: color === k ? 3 : 1, borderColor: color === k ? colores.marino : colores.linea }} />
            <Text style={[s.filaDetalle, { fontSize: 11 }]}>{p.nombre}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setColor('propio')} accessibilityRole="button" accessibilityLabel="Color propio" accessibilityState={{ selected: color === 'propio' }} style={{ alignItems: 'center', gap: 4, width: 58 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: esColorPropio(hex) ? hex : fondos.tarjeta, borderWidth: color === 'propio' ? 3 : 1, borderColor: color === 'propio' ? colores.marino : colores.linea }}>
            {!esColorPropio(hex) && <Ionicons name="color-palette-outline" size={18} color={colores.marino} />}
          </View>
          <Text style={[s.filaDetalle, { fontSize: 11 }]}>Propio</Text>
        </Pressable>
      </View>
      {color === 'propio' && <Campo etiqueta="Código del color" value={hex} onChangeText={setHex} placeholder="#1879B4" autoCapitalize="characters" maxLength={7} ayuda="Un color en formato #RRGGBB. El texto se pone blanco u oscuro solo, para que se lea." />}

      <Text style={s.etiqueta}>Forma</Text>
      <Segmentado opciones={[{ valor: 'centro', texto: 'Al centro' }, { valor: 'abajo', texto: 'Desde abajo' }, { valor: 'pantalla', texto: 'Pantalla completa' }]} valor={forma} onCambio={setForma} />
      <View style={{ height: espacio.m }} />
      <Text style={s.etiqueta}>Texto</Text>
      <Segmentado opciones={[{ valor: 'centro', texto: 'Centrado' }, { valor: 'izquierda', texto: 'A la izquierda' }]} valor={alineacion} onCambio={setAlineacion} />
      <View style={{ height: espacio.m }} />

      <Seccion>Cuándo y a quién</Seccion>
      <SelectorCarrera carreras={carreras} valor={carrera} onCambio={setCarrera} mostrarAlcance={false} />
      <Text style={s.etiqueta}>Dónde aparece</Text>
      <Segmentado opciones={[{ valor: 'inicio', texto: 'Al entrar al Inicio' }, { valor: 'todas', texto: 'En cualquier pantalla' }]} valor={donde} onCambio={setDonde} />
      <View style={{ height: espacio.m }} />
      <Text style={s.etiqueta}>Cada cuánto</Text>
      <Segmentado opciones={[{ valor: 'una_vez', texto: 'Una vez' }, { valor: 'diaria', texto: 'Cada día' }, { valor: 'siempre', texto: 'Cada vez' }]} valor={frecuencia} onCambio={setFrecuencia} />
      <Text style={[s.filaDetalle, { marginTop: espacio.xs, marginBottom: espacio.m }]}>
        {frecuencia === 'una_vez' ? 'Cada estudiante la ve una sola vez (si la editás, la vuelven a ver).' : frecuencia === 'diaria' ? 'Aparece una vez por día mientras esté visible.' : 'Aparece cada vez que abren la app.'}
      </Text>

      <Text style={s.etiqueta}>Desde</Text>
      <SelectorCuando valor={cuando} onCambio={setCuando} textoAhora={original && new Date(original.desde) <= new Date() ? 'Ya empezó' : 'Ahora'} />
      <Text style={s.etiqueta}>Hasta</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {DURACIONES.map((d) => <Chip key={d.texto} texto={d.texto} elegido={d.dias === 0 ? !conFin : false} onPress={() => fijarDuracion(d.dias)} />)}
        <Chip texto="Elegir fecha" icono="calendar-outline" elegido={conFin} onPress={() => setConFin(true)} />
      </View>
      {conFin && (
        <View style={{ flexDirection: 'row', gap: espacio.m }}>
          <CampoFechaHora etiqueta="Fecha" modo="date" valor={finFecha} onCambio={setFinFecha} minimo={hoy()} estilo={{ flex: 3 }} />
          <CampoFechaHora etiqueta="Hora" modo="time" valor={finHora} onCambio={setFinHora} estilo={{ flex: 2 }} />
        </View>
      )}

      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila
          icono="close-circle-outline"
          titulo="Cerrar tocando afuera"
          detalle={!cerrable ? 'Se cierra solo con la cruz.' : forma === 'pantalla' ? 'Ocupa toda la pantalla: se cierra con la cruz o con Atrás.' : 'Se cierra con la cruz o tocando afuera.'}
          derecha={<Switch value={cerrable} onValueChange={setCerrable} accessibilityLabel="Cerrar también tocando afuera" trackColor={{ true: fondos.marino, false: colores.linea }} thumbColor={colores.blanco} />}
        />
        <Fila
          icono="eye-outline"
          titulo="Visible"
          detalle="Apagala para que deje de aparecer sin borrarla."
          derecha={<Switch value={activa} onValueChange={setActiva} accessibilityLabel="Visible" trackColor={{ true: fondos.marino, false: colores.linea }} thumbColor={colores.blanco} />}
        />
        <Fila icono="podium-outline" titulo="Prioridad" detalle="Si hay varias, sale primero la de número más alto." derecha={<Contador valor={prioridad} onCambio={setPrioridad} min={0} max={100} etiqueta="Prioridad" />} ultima />
      </Tarjeta>
    </>
  );

  const vistaPrevia = (
    <View>
      <Seccion>Vista previa</Seccion>
      <Segmentado opciones={[{ valor: 'claro', texto: 'Modo claro' }, { valor: 'oscuro', texto: 'Modo oscuro' }]} valor={verOscuro ? 'oscuro' : 'claro'} onCambio={(x) => setPreviaOscuro(x === 'oscuro')} />
      <View style={{ height: espacio.s }} />
      <View style={{ backgroundColor: verOscuro ? '#101A2E' : '#EEF4FC', borderRadius: radio.xl, overflow: 'hidden' }}>
        <View style={{ backgroundColor: cPrevia.velo, padding: forma === 'centro' ? espacio.l : 0, paddingTop: forma === 'centro' ? espacio.xl : espacio.xxxl * 2, minHeight: 320, justifyContent: forma === 'abajo' ? 'flex-end' : 'center', alignItems: 'center' }}>
          <TarjetaVentana v={{ ...dibujo, forma: forma === 'pantalla' ? 'centro' : forma }} anchoMaximo={forma === 'centro' ? 360 : 2000} oscuro={verOscuro} />
        </View>
      </View>
      <Boton texto="Ver como estudiante" icono="phone-portrait-outline" variante="secundario" compacto onPress={() => setPrevia(true)} estilo={{ marginTop: espacio.m }} />
      <Mensaje texto={error} />
      <Boton texto={editando ? 'Guardar cambios' : 'Publicar ventana'} icono="checkmark" onPress={guardar} cargando={guardando} estilo={{ marginTop: espacio.m }} />
      {editando && (
        <>
          {confirmarBorrar && <Mensaje texto="¿Seguro? La ventana desaparece para todos. Tocá de nuevo para borrarla." />}
          <Boton texto={confirmarBorrar ? 'Sí, borrar' : 'Borrar ventana'} variante="peligro" icono="trash-outline" onPress={borrar} deshabilitado={guardando} estilo={{ marginTop: espacio.m }} />
        </>
      )}
    </View>
  );

  return (
    <Pantalla>
      <BarraSuperior titulo={editando ? 'Editar ventana' : 'Nueva ventana'} onVolver={volver} />
      <Columnas izquierda={contenido} derecha={vistaPrevia} proporcion={1.2} />
      <Modal visible={previa} transparent animationType="fade" onRequestClose={() => setPrevia(false)} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: coloresVentana(dibujo.color, oscuro).velo }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setPrevia(false)} accessibilityLabel="Cerrar vista previa" />
        <View pointerEvents="box-none" style={{ flex: 1, justifyContent: forma === 'abajo' ? 'flex-end' : 'center', alignItems: 'center', padding: forma === 'centro' ? espacio.xl : 0 }}>
          <View style={{ width: '100%', alignItems: 'center', flex: forma === 'pantalla' ? 1 : undefined, backgroundColor: forma === 'centro' ? 'transparent' : coloresVentana(dibujo.color, oscuro).fondo }}>
            <TarjetaVentana v={dibujo} anchoMaximo={forma === 'centro' ? 440 : 640} onCerrar={() => setPrevia(false)} onBoton={() => setPrevia(false)} />
          </View>
        </View>
      </Modal>
    </Pantalla>
  );
}
