import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { BarraSuperior, Boton, Campo, Mensaje, Pantalla, s, Tarjeta } from '../../components/ui';
import { urlFoto, verificarCarnet } from '../../datos/socios';
import { fechaCorta, formatearCi, RESULTADO_VERIFICACION } from '../../lib/carnet';
import type { VerificacionCarnet } from '../../lib/tipos-db';
import { colores, espacio, fuentes, radio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

/**
 * Verificar el carnet de un socio: se escanea el QR con la cámara o se
 * escribe el número de socio o la cédula. Lo pueden usar las cuentas
 * validadoras y las de administración; la base deja registro.
 */
export default function VerificarCarnet() {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [escaneando, setEscaneando] = useState(false);
  const [texto, setTexto] = useState('');
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState<VerificacionCarnet | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ultimoLeido = useRef<string | null>(null);
  const enCurso = useRef(false);

  useEffect(() => {
    let vivo = true;
    setFoto(null);
    urlFoto(resultado?.foto_path).then((u) => vivo && setFoto(u));
    return () => {
      vivo = false;
    };
  }, [resultado?.foto_path]);

  async function consultar(valor: string) {
    if (!valor.trim() || enCurso.current) return;
    enCurso.current = true;
    setError(null);
    setConsultando(true);
    try {
      setResultado(await verificarCarnet(valor));
      setEscaneando(false);
    } catch (e) {
      // permite volver a escanear el mismo QR, con una pausa para no reintentar sin parar
      setTimeout(() => (ultimoLeido.current = null), 2000);
      setError(e instanceof Error ? e.message : 'No se pudo verificar.');
    } finally {
      enCurso.current = false;
      setConsultando(false);
    }
  }

  async function abrirCamara() {
    setResultado(null);
    ultimoLeido.current = null;
    if (!permiso?.granted) {
      const r = await pedirPermiso();
      if (!r.granted) {
        setError('Sin permiso de cámara no se puede escanear. Podés escribir el número de socio o la cédula.');
        return;
      }
    }
    setEscaneando(true);
  }

  const r = resultado ? RESULTADO_VERIFICACION[resultado.resultado] : null;

  return (
    <Pantalla>
      <BarraSuperior titulo="Verificar carnet" onVolver={volver} />

      {escaneando ? (
        <View style={est.camara}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (enCurso.current || data === ultimoLeido.current) return;
              ultimoLeido.current = data;
              consultar(data);
            }}
          />
          <View style={est.marco} pointerEvents="none" />
          <Text style={est.ayudaCamara}>{consultando ? 'Verificando…' : 'Apuntá al QR del carnet'}</Text>
        </View>
      ) : (
        <Boton texto={resultado ? 'Escanear otro carnet' : 'Escanear QR con la cámara'} icono="scan" onPress={abrirCamara} />
      )}
      {escaneando && <Boton texto="Cerrar la cámara" variante="fantasma" icono="close" onPress={() => setEscaneando(false)} />}

      {r && resultado && (
        <Tarjeta estilo={{ backgroundColor: r.fondo, marginTop: espacio.l }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }} accessibilityLiveRegion="polite">
            <Ionicons name={r.icono} size={30} color={r.color} />
            <View style={{ flex: 1 }}>
              <Text style={[est.resultado, { color: r.color }]}>{r.titulo}</Text>
              <Text style={s.filaDetalle}>{r.detalle}</Text>
            </View>
          </View>
          {resultado.nombre && (
            <View style={{ flexDirection: 'row', gap: espacio.m, marginTop: espacio.l, alignItems: 'center' }}>
              {foto ? (
                <Image source={{ uri: foto }} style={est.foto} accessibilityLabel={`Foto de ${resultado.nombre}`} />
              ) : (
                <View style={[est.foto, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="person" size={34} color={colores.textoTenue} /></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[s.filaTitulo, { color: colores.marino }]}>{resultado.nombre}</Text>
                <Text style={s.filaDetalle}>{resultado.numero_socio} · C.I. {formatearCi(resultado.ci ?? '')}</Text>
                {resultado.carrera ? <Text style={s.filaDetalle}>{resultado.carrera}</Text> : null}
                <Text style={s.filaDetalle}>{resultado.vigente_hasta ? `Vence el ${fechaCorta(resultado.vigente_hasta)}` : 'Sin vencimiento'}</Text>
              </View>
            </View>
          )}
          {resultado.nombre && <Text style={[s.filaDetalle, { marginTop: espacio.m }]}>Compará el nombre y la foto con la cédula de la persona.</Text>}
        </Tarjeta>
      )}

      <Mensaje texto={error} />

      <Text style={[s.etiqueta, { marginTop: espacio.xl, marginBottom: espacio.s }]}>O escribilo</Text>
      <Campo
        etiqueta="Número de socio o cédula"
        value={texto}
        onChangeText={setTexto}
        placeholder="Ej.: CEQ-0042 o 4.555.666"
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => consultar(texto)}
      />
      <Boton texto="Verificar" variante="secundario" icono="search" onPress={() => consultar(texto)} cargando={consultando && !escaneando} deshabilitado={!texto.trim()} />
      <View style={{ height: espacio.xl }} />
    </Pantalla>
  );
}

const est = StyleSheet.create({
  camara: { height: 320, borderRadius: radio.xl, overflow: 'hidden', backgroundColor: colores.marinoProfundo, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.s },
  marco: { width: 210, height: 210, borderRadius: radio.l, borderWidth: 3, borderColor: colores.blanco },
  ayudaCamara: { position: 'absolute', bottom: espacio.m, color: colores.blanco, fontFamily: fuentes.semibold, fontSize: 14 },
  resultado: { fontFamily: fuentes.bold, fontSize: 20 },
  foto: { width: 72, height: 90, borderRadius: radio.m, backgroundColor: colores.blanco },
});
