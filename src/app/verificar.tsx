import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { BarraSuperior, Boton, Campo, EstadoVacio, Mensaje, Pantalla, s, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { urlFoto, verificarCarnet } from '../datos/socios';
import { formatearCi, RESULTADO_VERIFICACION, textoSemestre } from '../lib/carnet';
import type { VerificacionCarnet } from '../lib/tipos-db';
import { colores, crearEstilos, espacio, fondos, fuentes, radio } from '../tema';
import { useTema } from '../context/TemaProvider';
import { textoError } from '../lib/errores';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * Verificar el carnet de un socio: se escanea el QR con la cámara o se
 * escribe la cédula. Lo pueden usar las cuentas
 * validadoras y las de administración; la base deja registro.
 */
export default function VerificarCarnet() {
  useTema();
  const { perfil } = useSesion();
  if (perfil && perfil.rol !== 'admin' && perfil.rol !== 'validador') {
    return (
      <Pantalla>
        <BarraSuperior titulo="Verificar carnet" onVolver={volver} />
        <EstadoVacio icono="lock-closed-outline" titulo="Solo para cuentas del CEQ" texto="Verificar carnets lo hacen las cuentas validadoras y de administración." />
      </Pantalla>
    );
  }
  return <Verificador />;
}

function Verificador() {
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
      setError(textoError(e, 'No se pudo verificar.'));
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
        setError('Sin permiso de cámara no se puede escanear. Podés escribir la cédula.');
        return;
      }
    }
    setEscaneando(true);
  }

  const r = resultado ? RESULTADO_VERIFICACION[resultado.resultado] : null;
  // Colores del tema (los de RESULTADO_VERIFICACION son los del tema claro).
  const tono = resultado?.resultado === 'vigente' ? { color: colores.verde, fondo: fondos.verdeFondo }
    : resultado?.resultado === 'vencido' ? { color: colores.amarillo, fondo: fondos.amarilloFondo }
    : { color: colores.rojo, fondo: fondos.rojoFondo };

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
        <Tarjeta estilo={{ backgroundColor: tono.fondo, marginTop: espacio.l }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }} accessibilityLiveRegion="polite">
            <Ionicons name={r.icono} size={30} color={tono.color} />
            <View style={{ flex: 1 }}>
              <Text style={[est.resultado, { color: tono.color }]}>{r.titulo}</Text>
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
                <Text style={s.filaDetalle}>C.I. {formatearCi(resultado.ci ?? '')}</Text>
                {resultado.carrera ? <Text style={s.filaDetalle}>{resultado.carrera}</Text> : null}
                <Text style={s.filaDetalle}>{resultado.vigente_hasta ? `Vence el ${textoSemestre(resultado.vigente_hasta)}` : 'Sin vencimiento'}</Text>
              </View>
            </View>
          )}
          {resultado.nombre && <Text style={[s.filaDetalle, { marginTop: espacio.m }]}>Compará el nombre y la foto con la cédula de la persona.</Text>}
        </Tarjeta>
      )}

      <Mensaje texto={error} />

      <Text style={[s.etiqueta, { marginTop: espacio.xl, marginBottom: espacio.s }]}>O escribilo</Text>
      <Campo
        etiqueta="Cédula"
        value={texto}
        onChangeText={setTexto}
        placeholder="Ej.: 4.555.666"
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

const est = crearEstilos(() => ({
  camara: { height: 320, borderRadius: radio.xl, overflow: 'hidden', backgroundColor: fondos.marinoProfundo, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.s },
  marco: { width: 210, height: 210, borderRadius: radio.l, borderWidth: 3, borderColor: colores.blanco },
  ayudaCamara: { position: 'absolute', bottom: espacio.m, color: colores.blanco, fontFamily: fuentes.semibold, fontSize: 14 },
  resultado: { fontFamily: fuentes.bold, fontSize: 20 },
  foto: { width: 72, height: 90, borderRadius: radio.m, backgroundColor: fondos.blanco },
}));
