import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ConfirmarCuenta } from '../components/ConfirmarCuenta';
import { TecladoPin } from '../components/TecladoPin';
import { BarraSuperior, Boton, Mensaje, Pantalla, s } from '../components/ui';
import { useTema } from '../context/TemaProvider';
import { problemaPin } from '../lib/pin';
import { resultadoPin } from '../lib/enlace-pin';
import { borrarPin, comprobarPin, guardarPin, largoPin, reiniciarIntentosPin } from '../lib/pinGuardado';
import { colores, espacio, fondos, texto } from '../tema';

type Modo = 'crear' | 'cambiar' | 'quitar';
type Paso = 'actual' | 'nuevo' | 'confirmar';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/perfil'));

const TITULOS: Record<Modo, string> = { crear: 'Crear PIN', cambiar: 'Cambiar PIN', quitar: 'Quitar PIN' };

/** Crear, cambiar o quitar el PIN de la app (desde Mi perfil > Seguridad). */
export default function PantallaPin() {
  useTema();
  const params = useLocalSearchParams<{ modo?: string; recuperar?: string }>();
  const modo: Modo = params.modo === 'cambiar' || params.modo === 'quitar' ? params.modo : 'crear';
  const [paso, setPaso] = useState<Paso>(modo === 'crear' ? 'nuevo' : 'actual');
  const [largoActual, setLargoActual] = useState<number | null>(null);
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabado, setTrabado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [intento, setIntento] = useState(0);
  // recuperar=1: viene del enlace del correo (lo canjea ConfirmarCuenta).
  const [recuperando, setRecuperando] = useState(params.recuperar === '1' || (resultadoPin() ?? { tipo: 'error' }).tipo !== 'error');

  useEffect(() => {
    largoPin().then((l) => {
      setLargoActual(l);
      // Sin PIN guardado no hay "actual" que pedir.
      // Si ya hay PIN, "crear" lo reemplaza: primero hay que escribir el actual.
      if (l != null && modo === 'crear') setPaso('actual');
      if (l == null && modo !== 'crear') {
        if (modo === 'quitar') volver();
        else setPaso('nuevo');
      }
    });
  }, [modo]);

  const reiniciar = (msg: string | null) => {
    setError(msg);
    setIntento((n) => n + 1);
  };

  const conActual = async (pin: string) => {
    setOcupado(true);
    const r = await comprobarPin(pin)
      .catch(() => ({ ok: false as const, motivo: 'sin-pin' as const }))
      .finally(() => setOcupado(false));
    if (!r.ok && r.motivo === 'sin-pin') return reiniciar('No se pudo leer el PIN guardado. Probá de nuevo.');
    if (r.ok) {
      if (modo === 'quitar') {
        await borrarPin();
        volver();
        return;
      }
      reiniciar(null);
      setPaso('nuevo');
      return;
    }
    if (r.motivo === 'demasiados') {
      setTrabado(true);
      setError('Hubo demasiados intentos con un PIN incorrecto. Confirmá tu cuenta para crear uno nuevo.');
    } else if (r.motivo === 'esperar') reiniciar(`PIN incorrecto. Esperá ${r.segundos} s para volver a probar.`);
    else reiniciar('PIN incorrecto.');
  };

  // "¿Olvidaste tu PIN?": confirmada la cuenta, se salta el PIN actual.
  const cuentaConfirmada = async () => {
    await reiniciarIntentosPin().catch(() => {});
    setRecuperando(false);
    setTrabado(false);
    if (modo === 'quitar') {
      await borrarPin().catch(() => {});
      volver();
      return;
    }
    reiniciar(null);
    setPaso('nuevo');
  };

  const conNuevo = (pin: string) => {
    const problema = problemaPin(pin);
    if (problema) return reiniciar(problema);
    setNuevo(pin);
    reiniciar(null);
    setPaso('confirmar');
  };

  const conConfirmacion = async (pin: string) => {
    if (pin !== nuevo) {
      setNuevo('');
      setPaso('nuevo');
      return reiniciar('Los PIN no coinciden. Empezá de nuevo.');
    }
    setOcupado(true);
    const err = await guardarPin(pin).catch(() => 'No se pudo guardar el PIN en este dispositivo.');
    setOcupado(false);
    if (err) return reiniciar(err);
    volver();
  };

  const instruccion =
    paso === 'actual'
      ? 'Escribí tu PIN actual.'
      : paso === 'nuevo'
        ? 'Elegí un PIN de 4 a 6 números y tocá ✓.'
        : 'Escribilo otra vez para confirmar.';

  if (recuperando) {
    return (
      <Pantalla>
        <BarraSuperior titulo={TITULOS[modo]} onVolver={() => setRecuperando(false)} />
        <View style={{ marginTop: espacio.l }}>
          <ConfirmarCuenta onConfirmado={cuentaConfirmada} onCancelar={() => setRecuperando(false)} />
        </View>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <BarraSuperior titulo={TITULOS[modo]} onVolver={volver} />
      <View style={{ alignItems: 'center', marginTop: espacio.l }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="keypad-outline" size={30} color={colores.marino} />
        </View>
        <Text style={[texto.subtitulo, { color: colores.marino, marginTop: espacio.m, textAlign: 'center' }]} accessibilityLiveRegion="polite">
          {instruccion}
        </Text>
        {paso === 'nuevo' && (
          <Text style={[s.filaDetalle, { textAlign: 'center', marginTop: espacio.xs, marginBottom: espacio.s }]}>
            Lo vas a usar para abrir la app en este dispositivo. Si lo olvidás, podés crear otro confirmando tu cuenta.
          </Text>
        )}
        <View style={{ height: espacio.l }} />
        {!trabado && (paso !== 'actual' || largoActual != null) && (
          <TecladoPin
            key={paso}
            largo={paso === 'actual' ? largoActual : paso === 'confirmar' ? nuevo.length : null}
            reinicio={intento}
            deshabilitado={ocupado}
            onCompleto={paso === 'actual' ? conActual : paso === 'nuevo' ? conNuevo : conConfirmacion}
          />
        )}
      </View>
      <Mensaje texto={error} forma="linea" />
      {paso === 'actual' && largoActual != null && (
        <Boton
          texto={trabado ? 'Crear un PIN nuevo' : '¿Olvidaste tu PIN?'}
          variante={trabado ? 'primario' : 'fantasma'}
          icono={trabado ? 'shield-checkmark-outline' : undefined}
          onPress={() => { setError(null); setRecuperando(true); }}
        />
      )}
    </Pantalla>
  );
}
