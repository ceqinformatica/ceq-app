import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSesion } from '../context/SesionProvider';
import { salir } from '../lib/auth';
import { biometriaActiva, biometriaDisponible } from '../lib/biometria';
import { esperaPin, largoPin } from '../lib/pinGuardado';
import { colores, espacio, fondos, fuentes } from '../tema';
import { Hexagono } from './graficos';
import { TecladoPin } from './TecladoPin';
import { Boton, logoCeq, Mensaje } from './ui';

interface Metodos { bio: boolean; nombreBio: string; largo: number | null }

export function Bloqueo() {
  const { desbloquear, desbloquearConPin } = useSesion();
  const insets = useSafeAreaInsets();
  const [metodos, setMetodos] = useState<Metodos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);
  const [bloqueoTotal, setBloqueoTotal] = useState(false);
  const [intento, setIntento] = useState(0);
  const [comprobando, setComprobando] = useState(false);

  const conBiometria = useCallback(async () => {
    setError(null);
    if (!(await desbloquear())) setError('No se pudo verificar. Probá de nuevo.');
  }, [desbloquear]);

  useEffect(() => {
    (async () => {
      const [bio, d, largo, seg] = await Promise.all([
        biometriaActiva().catch(() => false),
        biometriaDisponible().catch(() => ({ disponible: false, nombre: 'huella' })),
        largoPin().catch(() => null),
        esperaPin().catch(() => 0),
      ]);
      // Si la huella se borró del dispositivo pero hay PIN, se usa solo el PIN.
      const usarBio = bio && (d.disponible || largo == null);
      setMetodos({ bio: usarBio, nombreBio: d.nombre, largo });
      setEspera(seg);
      if (usarBio) conBiometria();
    })();
  }, [conBiometria]);

  // Cuenta regresiva mientras hay que esperar por muchos intentos fallidos.
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((e) => Math.max(0, e - 1)), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const conPin = async (pin: string) => {
    setComprobando(true);
    setError(null);
    // Deja dibujar el último punto antes de calcular.
    await new Promise((r) => setTimeout(r, 30));
    const r = await desbloquearConPin(pin)
      .catch(() => ({ ok: false as const, motivo: 'sin-pin' as const }))
      .finally(() => setComprobando(false));
    if (r.ok) return;
    setIntento((n) => n + 1);
    if (r.motivo === 'esperar') {
      setEspera(r.segundos);
      setError('PIN incorrecto.');
    } else if (r.motivo === 'demasiados') {
      setBloqueoTotal(true);
    } else if (r.motivo === 'incorrecto') {
      setError(
        r.quedanAntesDeEsperar > 0
          ? `PIN incorrecto. ${r.quedanAntesDeEsperar === 1 ? 'Queda 1 intento' : `Quedan ${r.quedanAntesDeEsperar} intentos`} antes de tener que esperar.`
          : `PIN incorrecto. Después de ${r.quedanAntesDeSalir} ${r.quedanAntesDeSalir === 1 ? 'intento más' : 'intentos más'} se cierra la sesión.`,
      );
    } else {
      setError('No se pudo comprobar el PIN. Probá de nuevo o cerrá sesión y volvé a entrar.');
    }
  };

  const conPinActivo = metodos?.largo != null;
  const iconoBio = metodos?.nombreBio === 'reconocimiento facial' ? 'scan-outline' : 'finger-print';
  const subtitulo = bloqueoTotal
    ? `Hubo demasiados intentos con un PIN incorrecto. ${metodos?.bio ? `Usá tu ${metodos.nombreBio} o cerrá` : 'Cerrá'} sesión y volvé a entrar con tu cuenta para crear uno nuevo.`
    : conPinActivo
      ? metodos?.bio
        ? `Escribí tu PIN o usá tu ${metodos.nombreBio}.`
        : 'Escribí tu PIN para entrar.'
      : 'Usá tu huella o tu rostro para entrar.';

  return (
    <View style={{ flex: 1, backgroundColor: fondos.celesteMarca }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + espacio.l, paddingBottom: insets.bottom + espacio.l, paddingHorizontal: espacio.xl }}
        bounces={false}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <Hexagono tamano={conPinActivo ? 76 : 112} relleno={fondos.blanco}>
            <Image source={logoCeq} style={{ width: conPinActivo ? 52 : 76, height: conPinActivo ? 52 : 76 }} accessibilityLabel="Logo del CEQ" />
          </Hexagono>
          <Text style={{ fontFamily: fuentes.bold, fontSize: 22, color: colores.blanco, marginTop: espacio.l, textTransform: 'uppercase', letterSpacing: 1 }} accessibilityRole="header">
            App bloqueada
          </Text>
          <Text style={{ fontFamily: fuentes.regular, fontSize: 15, color: '#FFFFFF', marginTop: espacio.s, marginBottom: espacio.xl, textAlign: 'center' }}>
            {subtitulo}
          </Text>

          {metodos && conPinActivo && !bloqueoTotal && (
            <>
              <TecladoPin
                sobreMarca
                largo={metodos.largo}
                reinicio={intento}
                deshabilitado={espera > 0 || comprobando}
                onCompleto={conPin}
                teclaExtra={metodos.bio ? { icono: iconoBio, etiqueta: `Usar ${metodos.nombreBio}`, onPress: conBiometria } : undefined}
              />
              {espera > 0 && (
                <Text style={{ fontFamily: fuentes.semibold, fontSize: 14, color: '#FFFFFF', marginTop: espacio.s }} accessibilityLiveRegion="polite">
                  Esperá {formatoEspera(espera)} para volver a probar.
                </Text>
              )}
            </>
          )}

          {metodos && (!conPinActivo || (bloqueoTotal && metodos.bio)) && (
            <Pressable onPress={conBiometria} accessibilityRole="button" accessibilityLabel="Desbloquear" style={({ pressed }) => ({ marginTop: espacio.l, width: 84, height: 84, borderRadius: 42, backgroundColor: pressed ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(203,226,250,0.5)' })}>
              <Ionicons name={iconoBio} size={44} color={colores.blanco} />
            </Pressable>
          )}
        </View>

        <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', marginTop: espacio.l }}>
          <Mensaje texto={error} />
          {metodos && !conPinActivo && <Boton texto="Desbloquear" variante="claro" onPress={conBiometria} />}
          <Pressable onPress={salir} accessibilityRole="button" style={{ alignSelf: 'center', padding: espacio.m, marginTop: espacio.s }}>
            <Text style={{ fontFamily: fuentes.semibold, fontSize: 14, color: '#FFFFFF', textAlign: 'center' }}>
              {conPinActivo && !bloqueoTotal ? '¿Olvidaste el PIN? Cerrar sesión' : 'Cerrar sesión'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function formatoEspera(seg: number): string {
  if (seg < 60) return `${seg} s`;
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}
