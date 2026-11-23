import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { CampoFechaHora, hoy } from '../components/fecha';
import { BarraSuperior, Boton, Campo, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { enviarSolicitud } from '../datos/socios';
import { isoDeTexto, problemaVencimiento } from '../lib/carnet';
import { colores, crearEstilos, espacio, fondos, radio } from '../tema';
import { useTema } from '../context/TemaProvider';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/carnet'));

type Foto = { uri: string; tipo?: string };

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
  const [numero, setNumero] = useState('');
  const [vence, setVence] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  // Si el perfil terminó de cargar después de abrir la pantalla.
  useEffect(() => {
    if (perfil?.nombre) setNombre((n) => n || perfil.nombre || '');
    if (perfil?.ci) setCi((c) => c || perfil.ci || '');
  }, [perfil?.nombre, perfil?.ci]);

  const venceIso = vence ? isoDeTexto(vence) : null;
  const problemaFecha = vence ? problemaVencimiento(venceIso) : null;

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
  }

  async function enviar() {
    setError(null);
    if (!foto) return setError('Falta la foto del carnet.');
    if (nombre.trim().length < 3) return setError('Escribí tu nombre completo.');
    if (ci.replace(/\D/g, '').length < 4) return setError('Revisá tu número de cédula.');
    const p = problemaVencimiento(venceIso);
    if (p || !venceIso) return setError(p ?? 'Elegí la fecha de vencimiento.');
    setEnviando(true);
    try {
      await enviarSolicitud({ nombre, ci, numero_socio: numero, vigente_hasta: venceIso }, foto);
      setListo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar.');
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
        Si ya pagaste y tenés el carnet físico del CEQ, sacale una foto. El carnet dura 3 años (6 semestres): si no está vencido, el CEQ te habilita el digital.
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
          <Text style={[s.filaDetalle, { marginTop: espacio.xs }]}>Del lado donde se ven tu nombre y la fecha de vencimiento, con buena luz y sin reflejos.</Text>
        </>
      )}

      <Seccion>2. Datos del carnet</Seccion>
      <CampoFechaHora
        etiqueta="Vence el"
        modo="date"
        valor={vence}
        onCambio={setVence}
        minimo={hoy()}
        placeholder="Elegí la fecha que figura en el carnet"
        ayuda="La fecha de vencimiento impresa en tu carnet."
      />
      {problemaFecha && <Mensaje texto={problemaFecha} />}
      <Campo etiqueta="Nombre completo" value={nombre} onChangeText={setNombre} placeholder="Como figura en el carnet" maxLength={80} />
      <Campo etiqueta="Cédula" value={ci} onChangeText={setCi} placeholder="Ej.: 4.555.666" keyboardType="number-pad" maxLength={14} />
      <Campo etiqueta="Número de socio (si figura)" value={numero} onChangeText={setNumero} placeholder="Ej.: CEQ-0042" autoCapitalize="characters" maxLength={20} />

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
