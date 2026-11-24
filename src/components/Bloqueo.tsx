import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSesion } from '../context/SesionProvider';
import { salir } from '../lib/auth';
import { biometriaActiva, biometriaDisponible } from '../lib/biometria';
import { problemaPin } from '../lib/pin';
import { esperaPin, largoPin, reiniciarIntentosPin } from '../lib/pinGuardado';
import { colores, crearEstilos, espacio, fondos, fuentes } from '../tema';
import { ConfirmarCuenta } from './ConfirmarCuenta';
import { TecladoPin } from './TecladoPin';
import { LogoAcceso } from './LogoAcceso';
import { Boton, Mensaje } from './ui';

interface Metodos { bio: boolean; nombreBio: string; largo: number | null }

/** 'pin': pantalla normal. 'recuperar': "¿Olvidaste tu PIN?". 'nuevo'/'confirmar': elegir el PIN nuevo. */
type Vista = 'pin' | 'recuperar' | 'nuevo' | 'confirmar';

export function Bloqueo() {
  const { desbloquear, desbloquearConPin, abrirConPinNuevo } = useSesion();
  const [vista, setVista] = useState<Vista>('pin');
  const [pinNuevo, setPinNuevo] = useState('');
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
          : `PIN incorrecto. Después de ${r.quedanAntesDeSalir} ${r.quedanAntesDeSalir === 1 ? 'intento más' : 'intentos más'} vas a tener que confirmar tu cuenta para crear uno nuevo.`,
      );
    } else {
      setError('No se pudo comprobar el PIN. Probá de nuevo o cerrá sesión y volvé a entrar.');
    }
  };

  const reintentar = (msg: string | null) => {
    setError(msg);
    setIntento((n) => n + 1);
  };

  // Después de confirmar la cuenta: los fallos anteriores ya no cuentan.
  const cuentaConfirmada = async () => {
    await reiniciarIntentosPin().catch(() => {});
    setBloqueoTotal(false);
    setEspera(0);
    setPinNuevo('');
    reintentar(null);
    setVista('nuevo');
  };

  const conPinNuevo = (pin: string) => {
    const problema = problemaPin(pin);
    if (problema) return reintentar(problema);
    setPinNuevo(pin);
    reintentar(null);
    setVista('confirmar');
  };

  const conConfirmacion = async (pin: string) => {
    if (pin !== pinNuevo) {
      setPinNuevo('');
      setVista('nuevo');
      return reintentar('Los PIN no coinciden. Empezá de nuevo.');
    }
    setComprobando(true);
    const err = await abrirConPinNuevo(pin);
    setComprobando(false);
    if (err) reintentar(err);
  };

  const sinPin = async () => {
    const err = await abrirConPinNuevo(null);
    if (err) setError(err);
  };

  if (vista === 'recuperar') {
    return (
      <Fondo>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingTop: insets.top + espacio.xl, paddingBottom: insets.bottom + espacio.l, paddingHorizontal: espacio.xl }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>
            {/* ConfirmarCuenta trae su propio encabezado ("¿Olvidaste tu PIN?"), como en la maqueta. */}
            <Text style={est.titulo}>Recuperá tu acceso</Text>
            <Text style={[est.sub, { marginBottom: espacio.l }]}>Confirmá tu identidad para elegir un nuevo PIN.</Text>
            <ConfirmarCuenta onConfirmado={cuentaConfirmada} onCancelar={() => { setError(null); setVista('pin'); }} />
          </View>
        </ScrollView>
      </Fondo>
    );
  }

  if (vista === 'nuevo' || vista === 'confirmar') {
    return (
      <Fondo>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + espacio.l, paddingBottom: insets.bottom + espacio.l, paddingHorizontal: espacio.xl }}
          bounces={false}
        >
          <View style={est.centro}>
            <Text style={est.titulo} accessibilityRole="header">
              {vista === 'nuevo' ? 'Elegí un PIN nuevo' : 'Confirmá el PIN'}
            </Text>
            <Text style={[est.sub, { marginBottom: espacio.l }]} accessibilityLiveRegion="polite">
              {vista === 'nuevo' ? 'Escribí de 4 a 6 números y tocá ✓.' : 'Escribilo otra vez para confirmar.'}
            </Text>
            <TecladoPin
              key={vista}
              largo={vista === 'confirmar' ? pinNuevo.length : null}
              reinicio={intento}
              deshabilitado={comprobando}
              onCompleto={vista === 'nuevo' ? conPinNuevo : conConfirmacion}
            />
          </View>
          <View style={est.abajo}>
            <Mensaje texto={error} />
            <Pressable onPress={sinPin} accessibilityRole="button" style={{ alignSelf: 'center', padding: espacio.m, marginTop: espacio.s }}>
              <Text style={est.enlace}>{metodos?.bio ? `Seguir solo con la ${metodos.nombreBio}` : 'Seguir sin PIN'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Fondo>
    );
  }

  const conPinActivo = metodos?.largo != null;
  const iconoBio = metodos?.nombreBio === 'reconocimiento facial' ? 'scan-outline' : 'finger-print';
  const subtitulo = bloqueoTotal
    ? `Hubo demasiados intentos con un PIN incorrecto. ${metodos?.bio ? `Usá tu ${metodos.nombreBio} o confirmá` : 'Confirmá'} tu cuenta para crear uno nuevo.`
    : conPinActivo
      ? metodos?.bio
        ? `Escribí tu PIN o usá tu ${metodos.nombreBio}.`
        : 'Escribí tu PIN para entrar.'
      : 'Usá tu huella o tu rostro para entrar.';

  const pie = (
        <View style={est.abajo}>
          <Mensaje texto={error} />
          {metodos && !conPinActivo && <Boton texto="Desbloquear" onPress={conBiometria} />}
          {conPinActivo && bloqueoTotal && <Boton texto="Crear un PIN nuevo" onPress={() => { setError(null); setVista('recuperar'); }} />}
          {conPinActivo && !bloqueoTotal && (
            <Pressable onPress={() => { setError(null); setVista('recuperar'); }} accessibilityRole="button" style={{ alignSelf: 'center', padding: espacio.m }}>
              <Text style={[est.enlace, { fontFamily: fuentes.bold, fontSize: 15, textDecorationLine: 'underline' }]}>¿Olvidaste tu PIN?</Text>
            </Pressable>
          )}
          <Pressable onPress={salir} accessibilityRole="button" style={{ alignSelf: 'center', padding: espacio.m, marginTop: espacio.xs }}>
            <Text style={est.enlace}>Cerrar sesión</Text>
          </Pressable>
        </View>
  );

  return (
    <Fondo>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + espacio.l, paddingBottom: insets.bottom + espacio.l, paddingHorizontal: espacio.xl }}
        bounces={false}
      >
        <View style={est.centro}>
          <View style={{ marginBottom: espacio.m }}>
            <LogoAcceso tamano={conPinActivo ? 64 : 92} />
          </View>
          <Text style={est.titulo} accessibilityRole="header">Desbloqueá tu portal</Text>
          <Text style={[est.sub, { marginBottom: espacio.l }]}>{subtitulo}</Text>

          {metodos && conPinActivo && !bloqueoTotal && (
            <>
              <TecladoPin
                largo={metodos.largo}
                reinicio={intento}
                deshabilitado={espera > 0 || comprobando}
                onCompleto={conPin}
                teclaExtra={metodos.bio ? { icono: iconoBio, etiqueta: `Usar ${metodos.nombreBio}`, onPress: conBiometria } : undefined}
              />
              {espera > 0 && (
                <Text style={[est.sub, { fontFamily: fuentes.semibold, marginTop: espacio.s }]} accessibilityLiveRegion="polite">
                  Esperá {formatoEspera(espera)} para volver a probar.
                </Text>
              )}
            </>
          )}

          {metodos && (!conPinActivo || (bloqueoTotal && metodos.bio)) && (
            <Pressable
              onPress={conBiometria}
              accessibilityRole="button"
              accessibilityLabel={`Usar ${metodos.nombreBio}`}
              style={({ pressed }) => [est.huella, pressed && { backgroundColor: fondos.cielo }]}
            >
              <Ionicons name={iconoBio} size={40} color={colores.marino} />
            </Pressable>
          )}
          {!conPinActivo && pie}
        </View>

        {conPinActivo && pie}
      </ScrollView>
    </Fondo>
  );
}

/** Fondo claro con un círculo decorativo arriba a la izquierda (como la maqueta). */
function Fondo({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: fondos.fondo, overflow: 'hidden' }}>
      <View pointerEvents="none" style={est.circulo} />
      {children}
    </View>
  );
}

const est = crearEstilos(() => ({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 420, alignSelf: 'center' } as ViewStyle,
  abajo: { width: '100%', maxWidth: 420, alignSelf: 'center', marginTop: espacio.l } as ViewStyle,
  titulo: { fontFamily: fuentes.bold, fontSize: 28, color: colores.texto, textAlign: 'center', letterSpacing: -0.4 },
  sub: { fontFamily: fuentes.regular, fontSize: 14.5, color: colores.textoSuave, marginTop: espacio.s, textAlign: 'center' },
  enlace: { fontFamily: fuentes.semibold, fontSize: 14.5, color: colores.marino, textAlign: 'center' },
  huella: {
    marginTop: espacio.s, marginBottom: espacio.l, width: 84, height: 84, borderRadius: 42, backgroundColor: fondos.tarjeta,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colores.linea,
  } as ViewStyle,
  circulo: { position: 'absolute', top: -110, left: -150, width: 300, height: 300, borderRadius: 150, backgroundColor: fondos.burbuja } as ViewStyle,
}));

function formatoEspera(seg: number): string {
  if (seg < 60) return `${seg} s`;
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}
