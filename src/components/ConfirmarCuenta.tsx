import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSesion } from '../context/SesionProvider';
import { db as demo, MODO_DEMO } from '../datos/demo';
import { confirmarConClave, pedirEnlacePin, salir } from '../lib/auth';
import { abrirPantallaPin, escucharResultadoPin, tomarResultadoPin } from '../lib/enlace-pin';
import { biometriaActiva, biometriaDisponible, verificarIdentidad } from '../lib/biometria';
import { correoValido, metodosDeCuenta, mismoCorreo } from '../lib/recuperacion';
import { colores, crearEstilos, espacio, fondos, fuentes } from '../tema';
import { Boton, Campo, Mensaje, s } from './ui';

/**
 * "Olvidé mi PIN": la persona confirma que es la dueña de la cuenta (con la
 * huella que ya usa para abrir la app, con un enlace al correo de la cuenta
 * o con la contraseña) y después puede crear un PIN nuevo. No se borra ningún
 * dato. Para el enlace tiene que escribir el correo de su cuenta: si no
 * coincide, no se manda nada. Google y Microsoft no sirven acá, porque en el
 * celular esas cuentas ya están abiertas y cualquiera que lo tenga en la mano
 * podría tocarlas. El enlace del correo solo sirve en este mismo celular.
 */
export function ConfirmarCuenta({ onConfirmado, onCancelar }: { onConfirmado: () => void; onCancelar: () => void }) {
  const { sesion } = useSesion();
  const metodos = MODO_DEMO ? { clave: true, correo: demo.correo } : metodosDeCuenta(sesion?.user);
  const [huella, setHuella] = useState<string | null>(null);
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState<'huella' | 'clave' | 'enlace' | 'pedir' | null>(null);
  const [correo, setCorreo] = useState('');
  const [enviado, setEnviado] = useState<string | null>(null);
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // La huella sirve solo si la persona ya la usa para abrir la app.
  useEffect(() => {
    Promise.all([biometriaActiva(), biometriaDisponible()])
      .then(([activa, d]) => setHuella(activa && d.disponible ? d.nombre : null))
      .catch(() => setHuella(null));
  }, []);

  const intentar = async (tipo: 'huella' | 'clave', accion: () => Promise<string | null>) => {
    setCargando(tipo);
    setError(null);
    setErrorClave(null);
    const r = await accion().catch(() => 'No se pudo confirmar. Probá de nuevo.');
    setCargando(null);
    if (r === null) onConfirmado();
    else if (r !== 'cancelado') (tipo === 'clave' ? setErrorClave : setError)(r);
  };

  // El enlace del correo puede llegar con esta pantalla abierta (o haber
  // llegado antes de abrirla): se canjea y, si es de esta cuenta, sigue.
  const confirmarRef = useRef(onConfirmado);
  confirmarRef.current = onConfirmado;
  useEffect(() => {
    const atender = () => {
      const r = tomarResultadoPin();
      if (!r) return;
      if (r.tipo === 'canjeando') {
        setEnviado((e) => e ?? '');
        setCargando('enlace');
        return;
      }
      setCargando(null);
      if (r.tipo === 'confirmado') confirmarRef.current();
      else {
        // El enlace no sirvió: se vuelve a pedir el correo (sin el aviso de "enviado").
        setEnviado(null);
        setErrorCorreo(r.mensaje);
      }
    };
    const cerrar = abrirPantallaPin();
    atender();
    const dejar = escucharResultadoPin(atender);
    return () => {
      dejar();
      cerrar();
    };
  }, []);

  // Demo: el enlace "llega" solo; se cancela si se cierra la pantalla.
  const demoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (demoRef.current) clearTimeout(demoRef.current);
  }, []);

  // Primero se comprueba que el correo escrito sea el de la cuenta; si no, no se manda nada.
  const pedirEnlace = async () => {
    if (cargando != null) return;
    setError(null);
    setErrorCorreo(null);
    if (!correoValido(correo)) return setErrorCorreo('Escribí tu correo completo, por ejemplo nombre@gmail.com.');
    if (!mismoCorreo(correo, metodos.correo)) return setErrorCorreo('Ese no es el correo de esta cuenta. Escribí el mismo con el que entrás al Portal CEQ.');
    setCargando('pedir');
    if (MODO_DEMO) {
      await new Promise((r) => setTimeout(r, 400));
      setCargando(null);
      setEnviado(metodos.correo ?? correo.trim());
      if (demoRef.current) clearTimeout(demoRef.current);
      demoRef.current = setTimeout(() => confirmarRef.current(), 2500);
      return;
    }
    const r = await pedirEnlacePin(metodos.correo ?? '').catch(() => 'No se pudo mandar el correo. Probá de nuevo.');
    setCargando(null);
    if (r) setErrorCorreo(r);
    else setEnviado(metodos.correo ?? correo.trim());
  };

  const otroEnlace = () => {
    if (demoRef.current) clearTimeout(demoRef.current);
    demoRef.current = null;
    setEnviado(null);
    setErrorCorreo(null);
  };

  const conHuella = () =>
    intentar('huella', async () => ((await verificarIdentidad('Confirmá para crear un PIN nuevo')) ? null : 'cancelado'));
  const conClave = () =>
    intentar('clave', async () => {
      if (MODO_DEMO) {
        await new Promise((r) => setTimeout(r, 400));
        return null;
      }
      return confirmarConClave(metodos.correo ?? '', clave);
    });

  const ninguno = !huella && !metodos.clave && !metodos.correo;

  return (
    <View>
      <View style={est.icono}>
        <Ionicons name="shield-checkmark-outline" size={28} color={colores.marino} />
      </View>
      <Text style={est.titulo} accessibilityRole="header">¿Olvidaste tu PIN?</Text>
      <Text style={[s.sub, { textAlign: 'center', marginBottom: espacio.l }]}>
        Confirmá que sos vos y elegís uno nuevo. No se borra nada de tu información.
      </Text>

      {huella && (
        <Boton
          texto={`Usar mi ${huella}`}
          icono={huella === 'reconocimiento facial' ? 'scan-outline' : 'finger-print'}
          onPress={conHuella}
          cargando={cargando === 'huella'}
          deshabilitado={cargando != null}
        />
      )}

      {metodos.correo && (
        <View style={{ marginTop: huella ? espacio.l : 0 }}>
          {huella && <Text style={est.separador}>o con un enlace a tu correo</Text>}
          {enviado != null ? (
            <Mensaje
              tipo="exito"
              titulo={cargando === 'enlace' ? 'Comprobando el enlace…' : 'Revisá tu correo'}
              texto={cargando === 'enlace'
                ? 'Un momento, estamos confirmando que el enlace sea de tu cuenta.'
                : `Te mandamos un enlace a ${enviado || 'tu correo'}. Abrilo desde este celular para elegir un PIN nuevo. Si no lo ves, mirá en spam. Si pedís otro, el anterior deja de servir.`}
            />
          ) : (
            <Campo
              etiqueta="Correo de tu cuenta"
              value={correo}
              onChangeText={(t) => {
                setCorreo(t);
                setErrorCorreo(null);
              }}
              placeholder="nombre@gmail.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              onSubmitEditing={() => correo && pedirEnlace()}
            />
          )}
          <Mensaje texto={errorCorreo} />
          <Boton
            texto={enviado != null ? 'Mandar otro enlace' : 'Mandarme un enlace'}
            icono="mail-outline"
            variante={huella ? 'secundario' : 'primario'}
            onPress={enviado != null ? otroEnlace : pedirEnlace}
            cargando={cargando === 'pedir' || cargando === 'enlace'}
            deshabilitado={cargando != null || (enviado == null && !correo.trim())}
          />
        </View>
      )}

      {metodos.clave && (
        <View style={{ marginTop: espacio.l }}>
          {(huella || metodos.correo) && <Text style={est.separador}>o con la contraseña de tu cuenta</Text>}
          <View>
            <Campo
              etiqueta="Contraseña"
              value={clave}
              onChangeText={(t) => {
                setClave(t);
                setErrorClave(null);
              }}
              secureTextEntry={!verClave}
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={() => clave && cargando == null && conClave()}
            />
            <Pressable onPress={() => setVerClave((v) => !v)} accessibilityRole="button" accessibilityLabel={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={est.ojo} hitSlop={8}>
              <Ionicons name={verClave ? 'eye-off-outline' : 'eye-outline'} size={20} color={colores.textoSuave} />
            </Pressable>
          </View>
          <Mensaje texto={errorClave} />
          <Boton texto="Confirmar" onPress={conClave} cargando={cargando === 'clave'} deshabilitado={!clave || cargando != null} />
        </View>
      )}

      {ninguno && <Mensaje tipo="info" texto="No encontramos otra forma de confirmar tu cuenta. Escribinos a informatica@ceq-una.com y te ayudamos a crear un PIN nuevo." />}
      <Mensaje texto={error} />

      <Boton texto="Volver al PIN" variante="fantasma" onPress={onCancelar} deshabilitado={cargando != null && cargando !== 'enlace'} estilo={{ marginTop: espacio.s }} />
      <Pressable onPress={async () => setError(await salir())} accessibilityRole="button" style={{ alignSelf: 'center', padding: espacio.s }}>
        <Text style={[s.filaDetalle, { textAlign: 'center' }]}>
          ¿Tampoco podés entrar a tu cuenta? <Text style={s.enlace}>Cerrar sesión</Text>
        </Text>
      </Pressable>
    </View>
  );
}

const est = crearEstilos(() => ({
  icono: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.m },
  titulo: { fontFamily: fuentes.bold, fontSize: 20, color: colores.marino, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
  ojo: { position: 'absolute', right: 14, top: 38 },
  separador: { fontFamily: fuentes.medium, fontSize: 13, color: colores.textoSuave, textAlign: 'center', marginBottom: espacio.m },
}));
