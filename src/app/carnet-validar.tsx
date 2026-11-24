import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { BarraSuperior, Boton, Campo, Chip, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { enviarSolicitud } from '../datos/socios';
import { fechaCorta, isoDeTexto, opcionesSemestre, problemaVencimiento } from '../lib/carnet';
import { leerVencimiento } from '../lib/leer-vencimiento';
import { CampoFechaHora } from '../components/fecha';
import { colores, crearEstilos, espacio, fondos, radio } from '../tema';
import { useTema } from '../context/TemaProvider';
import { textoError } from '../lib/errores';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/carnet'));

type Foto = { uri: string; tipo?: string };

/** Lo que la app leyó en la foto: la fecha, o nada si no encontró ninguna. */
type Lectura = { estado: 'leyendo' } | { estado: 'leida'; leido: string; iso: string } | { estado: 'sin_fecha' } | null;

/**
 * Lee el texto de la foto con el reconocedor del celular (sin internet).
 * En la web, o si el módulo no está, devuelve null y se elige a mano.
 */
async function textoDeFoto(uri: string): Promise<string[] | null> {
  if (Platform.OS === 'web') return null;
  try {
    const m = await import('expo-text-extractor');
    if (!m.isSupported) return null;
    return await m.extractTextFromImage(uri);
  } catch {
    return null;
  }
}

/**
 * El estudiante que ya pagó y tiene el carnet físico le saca una foto,
 * elige el vencimiento que figura en él y lo envía. Si no está vencido,
 * el CEQ lo revisa y le habilita el carnet digital.
 */
export default function ValidarCarnet() {
  useTema();
  const { perfil } = useSesion();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const camara = useRef<CameraView>(null);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [foto, setFoto] = useState<Foto | null>(null);
  const [nombre, setNombre] = useState(perfil?.nombre ?? '');
  const [ci, setCi] = useState(perfil?.ci ?? '');
  const [vence, setVence] = useState('');
  const [otraFecha, setOtraFecha] = useState('');
  const [lectura, setLectura] = useState<Lectura>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  // Si el perfil terminó de cargar después de abrir la pantalla.
  useEffect(() => {
    if (perfil?.nombre) setNombre((n) => n || perfil.nombre || '');
    if (perfil?.ci) setCi((c) => c || perfil.ci || '');
  }, [perfil?.nombre, perfil?.ci]);

  const semestres = opcionesSemestre();
  const venceIso = vence || null;
  const problemaFecha = vence ? problemaVencimiento(venceIso) : null;

  // Si saca otra foto mientras se lee la anterior, la lectura vieja se descarta.
  const lecturaActual = useRef(0);

  async function leerFoto(uri: string) {
    const n = ++lecturaActual.current;
    setLectura({ estado: 'leyendo' });
    const lineas = await textoDeFoto(uri);
    if (n !== lecturaActual.current) return;
    if (!lineas) return setLectura(null);
    const r = leerVencimiento(lineas);
    if (!r) return setLectura({ estado: 'sin_fecha' });
    setLectura({ estado: 'leida', leido: r.leido, iso: r.iso });
    setVence(r.iso);
    setOtraFecha(semestres.some((o) => o.valor === r.iso) ? '' : fechaCorta(r.iso));
  }

  function elegirOtraFecha(texto: string) {
    lecturaActual.current++;
    setOtraFecha(texto);
    setVence(isoDeTexto(texto) ?? '');
  }

  async function abrirCamara() {
    setError(null);
    if (Platform.OS === 'web') return elegirDeGaleria();
    if (!permiso?.granted) {
      const r = await pedirPermiso();
      if (!r.granted) return setError('Sin permiso de cámara podés elegir una foto de la galería.');
    }
    setCamaraAbierta(true);
  }

  async function sacarFoto() {
    try {
      const f = await camara.current?.takePictureAsync({ quality: 0.6 });
      if (f?.uri) {
        setFoto({ uri: f.uri, tipo: 'image/jpeg' });
        setCamaraAbierta(false);
        void leerFoto(f.uri);
      }
    } catch {
      setError('No se pudo sacar la foto. Probá de nuevo o elegila de la galería.');
    }
  }

  async function elegirDeGaleria() {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png'], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 8 * 1024 * 1024) return setError('La foto pesa más de 8 MB. Elegí una más liviana.');
    setFoto({ uri: a.uri, tipo: a.mimeType });
    setCamaraAbierta(false);
    void leerFoto(a.uri);
  }

  async function enviar() {
    setError(null);
    if (!foto) return setError('Falta la foto del carnet.');
    if (nombre.trim().length < 3) return setError('Escribí tu nombre completo.');
    if (ci.replace(/\D/g, '').length < 4) return setError('Revisá tu número de cédula.');
    const p = problemaVencimiento(venceIso);
    if (p || !venceIso) return setError(p ?? 'Elegí el vencimiento que figura en tu carnet.');
    setEnviando(true);
    try {
      await enviarSolicitud({ nombre, ci, numero_socio: '', vigente_hasta: venceIso }, foto);
      setListo(true);
    } catch (e) {
      setError(textoError(e, 'No se pudo enviar.'));
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Validar mi carnet" onVolver={volver} />
        <Tarjeta estilo={{ alignItems: 'center', paddingVertical: espacio.xl }}>
          <Ionicons name="hourglass-outline" size={40} color={colores.marino} />
          <Text style={[s.filaTitulo, { marginTop: espacio.m, textAlign: 'center' }]}>¡Enviado! El CEQ lo está revisando</Text>
          <Text style={[s.filaDetalle, { textAlign: 'center', marginTop: espacio.s }]}>
            Cuando lo aprueben, tu carnet digital con QR aparece solo en la app. Suele ser en el día.
          </Text>
        </Tarjeta>
        <Boton texto="Volver" variante="secundario" onPress={() => router.replace('/carnet')} />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <BarraSuperior titulo="Validar mi carnet" onVolver={volver} />
      <Text style={[s.filaDetalle, { marginBottom: espacio.m }]}>
        Si ya pagaste y tenés el carnet físico del CEQ, sacale una foto: la app lee el vencimiento. Si no está vencido, el CEQ te habilita el digital.
      </Text>

      <Seccion>1. Foto del carnet</Seccion>
      {camaraAbierta ? (
        <View style={est.camara}>
          <CameraView ref={camara} style={StyleSheet.absoluteFill} facing="back" />
          <View style={est.marco} pointerEvents="none" />
          <View style={est.botonesCamara}>
            <Boton texto="Sacar foto" icono="camera" variante="claro" onPress={sacarFoto} compacto />
            <Boton texto="Cancelar" variante="claro" onPress={() => setCamaraAbierta(false)} compacto />
          </View>
        </View>
      ) : foto ? (
        <Tarjeta>
          <Image source={{ uri: foto.uri }} style={est.vista} resizeMode="contain" accessibilityLabel="Foto de tu carnet" />
          <View style={{ flexDirection: 'row', gap: espacio.s, marginTop: espacio.m }}>
            <Boton texto="Sacar otra" icono="camera-outline" variante="secundario" onPress={abrirCamara} compacto estilo={{ flex: 1 }} />
            <Boton texto="Galería" icono="images-outline" variante="fantasma" onPress={elegirDeGaleria} compacto estilo={{ flex: 1 }} />
          </View>
        </Tarjeta>
      ) : (
        <>
          <Boton texto="Sacar foto del carnet" icono="camera" onPress={abrirCamara} />
          <Boton texto="Elegir de la galería" icono="images-outline" variante="fantasma" onPress={elegirDeGaleria} />
          <Text style={[s.filaDetalle, { marginTop: espacio.xs }]}>Del lado donde se ven tu nombre y el vencimiento, con buena luz y sin reflejos.</Text>
        </>
      )}

      <Seccion>2. Datos del carnet</Seccion>
      {lectura?.estado === 'leyendo' && <Mensaje tipo="info" texto="Leyendo el vencimiento de la foto…" />}
      {lectura?.estado === 'leida' && (
        <Mensaje tipo="info" texto={`Leímos en tu carnet: «${lectura.leido}» (${fechaCorta(lectura.iso)}). Revisá que sea el vencimiento; si no, corregilo abajo.`} />
      )}
      {lectura?.estado === 'sin_fecha' && <Mensaje tipo="info" texto="No pudimos leer el vencimiento en la foto. Elegilo abajo." />}
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Vence</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.xs }} accessibilityRole="radiogroup">
        {semestres.map((o) => (
          <Chip key={o.valor} texto={o.texto} elegido={vence === o.valor && !otraFecha} onPress={() => { lecturaActual.current++; setVence(o.valor); setOtraFecha(''); }} />
        ))}
      </View>
      <CampoFechaHora
        etiqueta="Otra fecha"
        modo="date"
        valor={otraFecha}
        onCambio={elegirOtraFecha}
        placeholder="Si tu carnet vence en un día exacto"
        opcional
        ayuda="Hay varios diseños de carnet: vale el vencimiento que figura en el tuyo."
      />
      {problemaFecha && <Mensaje texto={problemaFecha} />}
      <Campo etiqueta="Nombre completo" value={nombre} onChangeText={setNombre} placeholder="Como figura en el carnet" maxLength={80} />
      <Campo etiqueta="Cédula" value={ci} onChangeText={setCi} placeholder="Ej.: 4.555.666" keyboardType="number-pad" maxLength={14} />

      <Mensaje texto={error} />
      <Boton texto="Enviar al CEQ" icono="send" onPress={enviar} cargando={enviando} deshabilitado={!foto || !vence || Boolean(problemaFecha)} />
      <View style={{ height: espacio.xl }} />
    </Pantalla>
  );
}

const est = crearEstilos(() => ({
  camara: { height: 300, borderRadius: radio.xl, overflow: 'hidden', backgroundColor: fondos.marinoProfundo, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.m },
  marco: { width: '86%', aspectRatio: 1.586, borderRadius: radio.l, borderWidth: 3, borderColor: colores.blanco, marginBottom: 40 },
  botonesCamara: { position: 'absolute', bottom: espacio.m, flexDirection: 'row', gap: espacio.s },
  vista: { width: '100%', height: 200, borderRadius: radio.m, backgroundColor: fondos.tarjeta },
}));
