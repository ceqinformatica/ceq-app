import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Easing, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BotonProveedor } from '../components/BotonProveedor';
import { movimientoReducido } from '../components/movimiento';
import { LogoAcceso } from '../components/LogoAcceso';
import { Boton, Campo, EvitaTeclado, Mensaje, s, useBarraEstado } from '../components/ui';
import { problemaRegistro, type ModoAcceso, type Proveedor } from '../lib/acceso';
import { entrarConCorreo, entrarConGoogle, entrarConMicrosoft, pedirRecuperarClave, proveedoresDisponibles, registrarseConCorreo } from '../lib/auth';
import { CLAVE_MINIMA, correoValido } from '../lib/recuperacion';
import { supabaseConfigurado } from '../lib/supabase';
import { colores, crearEstilos, espacio, fondos, fuentes } from '../tema';
import { useTema } from '../context/TemaProvider';

const ENTRAR_CON: Record<Proveedor, () => Promise<string | null>> = { google: entrarConGoogle, microsoft: entrarConMicrosoft };

/** Radio de las curvas de las cabeceras celestes. */
const CURVA = 44;

/** Orden de las pantallas: avanzar desliza hacia arriba, volver desliza hacia abajo. */
const NIVEL: Record<ModoAcceso, number> = { portada: 0, entrar: 1, registro: 1, recuperar: 2 };

/**
 * Acceso. Siempre empieza en la portada (Iniciar sesión / Crear cuenta). Al
 * elegir, la portada sube y el formulario entra desde abajo, como una sola
 * hoja que se desliza. En cada formulario, abajo, Google y Microsoft.
 */
export default function Login() {
  useTema();
  // Íconos oscuros: arriba es celeste claro (portada) o blanco (formularios).
  useBarraEstado('dark');
  const insets = useSafeAreaInsets();
  const [modo, setModo] = useState<ModoAcceso>('portada');
  // Transición: la pantalla que se va y cuánto avanzó el deslizamiento (0 → 1).
  const [saliente, setSaliente] = useState<ModoAcceso | null>(null);
  const avance = useRef(new Animated.Value(1)).current;
  const sentido = useRef(1);
  // true mientras se desliza: un segundo toque no corta la animación a la mitad.
  const animando = useRef(false);
  const { height: alto } = useWindowDimensions();
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>(['google']);

  useEffect(() => {
    let activo = true;
    proveedoresDisponibles().then((p) => activo && setProveedores(p));
    return () => {
      activo = false;
    };
  }, []);

  const ejecutar = async (clave: string, accion: () => Promise<string | null>, exito?: string) => {
    setCargando(clave);
    setError(null);
    setInfo(null);
    const e = await accion().catch(() => 'No se pudo completar. Probá de nuevo.');
    setCargando(null);
    if (e) setError(e);
    else if (exito) setInfo(exito);
  };

  const cambiarModo = (m: ModoAcceso) => {
    if (m === modo || animando.current) return;
    Keyboard.dismiss();
    if (movimientoReducido()) {
      setSaliente(null);
      avance.setValue(1);
    } else {
      sentido.current = NIVEL[m] >= NIVEL[modo] ? 1 : -1;
      animando.current = true;
      setSaliente(modo);
      avance.stopAnimation();
      avance.setValue(0);
      Animated.timing(avance, {
        toValue: 1,
        duration: 460,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => {
        animando.current = false;
        setSaliente(null);
      });
    }
    setModo(m);
    setError(null);
    setInfo(null);
    setVerClave(false);
    // Las contraseñas no pasan de un formulario a otro (registro ↔ ingreso).
    setClave('');
    setRepetida('');
  };

  // Botón Atrás de Android: vuelve a la pantalla anterior del acceso en vez de cerrar la app.
  useEffect(() => {
    if (modo === 'portada') return;
    const destino: ModoAcceso = modo === 'recuperar' ? 'entrar' : 'portada';
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cambiarModo(destino);
      return true;
    });
    return () => sub.remove();
  }, [modo]);

  const problema = problemaRegistro({ nombre, apellido, correoOk: correoValido(correo), clave, repetida }, CLAVE_MINIMA);
  // La diferencia entre las dos contraseñas ya se avisa debajo del campo.
  const noCoinciden = !!repetida && repetida !== clave;

  const crearCuenta = async () => {
    if (problema) return setError(noCoinciden ? null : problema);
    setCargando('correo');
    setError(null);
    setInfo(null);
    const completo = `${nombre.trim()} ${apellido.trim()}`;
    const r = await registrarseConCorreo(correo, clave, completo).catch(() => ({ error: 'No se pudo crear la cuenta. Probá de nuevo.' }));
    setCargando(null);
    if ('error' in r) return setError(r.error);
    // 'adentro': la sesión ya cambió y la app pasa sola a la pantalla principal.
    if (r.resultado === 'confirmar')
      setInfo(`¡Listo! Te mandamos un correo a ${correo.trim()}. Abrí el enlace desde este celular para entrar. Revisá también la carpeta de spam.`);
    if (r.resultado === 'ya-existe') {
      cambiarModo('entrar');
      setClave('');
      setRepetida('');
      setInfo('Ese correo ya tiene una cuenta. Iniciá sesión con tu contraseña, o con Google o Microsoft si la creaste así.');
    }
  };

  const ocupado = cargando != null;
  const avisoConfig = !supabaseConfigurado && <Mensaje texto="Falta configurar Supabase. Copiá .env.example a .env y completá la URL y la clave pública." />;

  const portada = () => (
      <View style={{ flex: 1, backgroundColor: fondos.superficieBlanca }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
          <View style={[est.portada, { paddingTop: insets.top + espacio.xxl }]}>
            <Regla estilo={{ top: '30%' }} />
            <View style={{ alignItems: 'center' }}>
              <LogoAcceso tamano={112} />
              <Text style={est.marca} accessibilityRole="header">Portal CEQ</Text>
              <Text style={est.nombre}>Centro de Estudiantes de Química</Text>
              <Text style={est.lema}>Tu vida académica en la FCQ, en un solo lugar.</Text>
            </View>
          </View>
          <View style={{ backgroundColor: fondos.cabeceraAcceso, flexGrow: 1 }}>
            <View style={[est.pie, { paddingBottom: insets.bottom + espacio.xl }]}>
              <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', gap: espacio.s }}>
                {avisoConfig}
                <Boton texto="Iniciar sesión" onPress={() => cambiarModo('entrar')} />
                <Boton texto="Crear cuenta" variante="secundario" onPress={() => cambiarModo('registro')} />
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
  );

  const formulario = (m: Exclude<ModoAcceso, 'portada'>) => {

  /** Google y Microsoft, debajo del formulario. */
  const otrasCuentas = proveedores.length === 0 ? null : (
    <>
      <View style={est.separador}>
        <View style={est.linea} />
        <Text style={[s.filaDetalle, { color: colores.marinoOscuro }]}>o</Text>
        <View style={est.linea} />
      </View>
      {proveedores.map((p) => (
        <BotonProveedor key={p} proveedor={p} cargando={cargando === p} deshabilitado={ocupado} onPress={() => ejecutar(p, ENTRAR_CON[p])} />
      ))}
    </>
  );

  const ojo = (
    <Pressable onPress={() => setVerClave((v) => !v)} accessibilityRole="button" accessibilityLabel={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={est.ojo} hitSlop={8}>
      <Ionicons name={verClave ? 'eye-off-outline' : 'eye-outline'} size={20} color={colores.textoSuave} />
    </Pressable>
  );

  const campoCorreo = (
    <Campo etiqueta="Correo" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="nombre@ejemplo.com" />
  );

  const mensajes = (
    <>
      <Mensaje texto={error} />
      <Mensaje texto={info} tipo="exito" />
    </>
  );

  let titulo: string;
  let sub: string;
  let volverA: ModoAcceso;
  let cuerpo: ReactNode;

  if (m === 'recuperar') {
    titulo = 'Recuperá tu contraseña';
    sub = 'Te enviaremos un enlace al correo de tu cuenta.';
    volverA = 'entrar';
    cuerpo = (
      <>
        {campoCorreo}
        <Boton
          texto="Enviar enlace"
          icono="send-outline"
          cargando={cargando === 'recuperar'}
          deshabilitado={!correoValido(correo)}
          onPress={() =>
            ejecutar(
              'recuperar',
              () => pedirRecuperarClave(correo),
              `Si ${correo.trim()} tiene una cuenta, te llegó un correo. Abrí el enlace desde este mismo celular. Revisá también la carpeta de spam.`,
            )
          }
        />
        <Text style={[s.filaDetalle, { marginTop: espacio.m, color: colores.marinoOscuro }]}>Si entrás con Google o Microsoft, recuperá tu contraseña desde esa cuenta.</Text>
        {mensajes}
      </>
    );
  } else if (m === 'entrar') {
    titulo = 'Iniciar sesión';
    sub = 'Tu malla, tus firmas y tu agenda en la FCQ.';
    volverA = 'portada';
    cuerpo = (
      <>
        {campoCorreo}
        <View>
          <Campo etiqueta="Contraseña" value={clave} onChangeText={setClave} secureTextEntry={!verClave} autoComplete="current-password" textContentType="password" />
          {ojo}
        </View>
        <Boton
          texto="Entrar"
          cargando={cargando === 'correo'}
          deshabilitado={!correoValido(correo) || !clave || ocupado}
          onPress={() => ejecutar('correo', () => entrarConCorreo(correo, clave))}
        />
        <Pressable onPress={() => cambiarModo('recuperar')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', padding: espacio.s, marginTop: espacio.xs }}>
          <Text style={[s.enlace, { color: colores.marino }]}>¿Olvidaste tu contraseña?</Text>
        </Pressable>
        {mensajes}
        {otrasCuentas}
      </>
    );
  } else {
    titulo = 'Creá tu cuenta';
    sub = 'Te mandamos un correo para confirmar tu cuenta.';
    volverA = 'portada';
    cuerpo = (
      <>
        <View style={{ flexDirection: 'row', gap: espacio.m }}>
          <Campo estilo={{ flex: 1 }} etiqueta="Nombre" value={nombre} onChangeText={setNombre} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" />
          <Campo estilo={{ flex: 1 }} etiqueta="Apellido" value={apellido} onChangeText={setApellido} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" />
        </View>
        {campoCorreo}
        <View>
          <Campo
            etiqueta="Contraseña"
            value={clave}
            onChangeText={setClave}
            secureTextEntry={!verClave}
            autoComplete="new-password"
            textContentType="newPassword"
            ayuda={`Mínimo ${CLAVE_MINIMA} caracteres.`}
          />
          {ojo}
        </View>
        <Campo
          etiqueta="Verificar contraseña"
          value={repetida}
          onChangeText={setRepetida}
          secureTextEntry={!verClave}
          autoComplete="new-password"
          textContentType="newPassword"
          ayuda={noCoinciden ? 'Las dos contraseñas no coinciden.' : undefined}
        />
        {/* Activo aunque falten datos: al tocarlo dice qué falta. */}
        <Boton texto="Crear cuenta" cargando={cargando === 'correo'} deshabilitado={ocupado} onPress={crearCuenta} />
        {mensajes}
        {otrasCuentas}
      </>
    );
  }

  return (
      // Como la maqueta animada: arriba blanco (sigue al blanco de la portada al deslizar) y el
      // formulario sobre celeste, unidos por la misma curva en S que la portada.
      <ScrollView style={{ flex: 1, backgroundColor: fondos.cabeceraAcceso }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={[est.cabecera, { paddingTop: insets.top + espacio.l }]}>
            <Regla estilo={{ top: insets.top + espacio.s }} corta />
            <Pressable onPress={() => cambiarModo(volverA)} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={10} style={{ alignSelf: 'flex-start', paddingVertical: espacio.xs }}>
              <Ionicons name="arrow-back" size={24} color={colores.marinoOscuro} />
            </Pressable>
            <Text style={est.titulo} accessibilityRole="header">{titulo}</Text>
            <Text style={est.sub}>{sub}</Text>
          </View>
          <View style={{ flexGrow: 1, backgroundColor: fondos.superficieBlanca }}>
            <View style={[est.cuerpo, { paddingBottom: insets.bottom + espacio.xl }]}>
              <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
                {avisoConfig}
                {cuerpo}
              </View>
            </View>
          </View>
      </ScrollView>
  );
  };

  const pantalla = (m: ModoAcceso) => (m === 'portada' ? portada() : formulario(m));
  const desplazamiento = (entra: boolean) =>
    avance.interpolate({ inputRange: [0, 1], outputRange: entra ? [sentido.current * alto, 0] : [0, -sentido.current * alto] });
  // Las dos pantallas van con su key: la que se va no se vuelve a montar al empezar a salir.
  const capas = saliente && saliente !== modo ? [saliente, modo] : [modo];

  return (
    <EvitaTeclado estilo={{ backgroundColor: fondos.cabeceraAcceso }}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        {capas.map((m) => {
          const entra = m === modo;
          return (
            <Animated.View
              key={m}
              aria-hidden={!entra}
              importantForAccessibility={entra ? 'auto' : 'no-hide-descendants'}
              accessibilityElementsHidden={!entra}
              style={[StyleSheet.absoluteFill, { pointerEvents: entra ? 'auto' : 'none' }, capas.length > 1 && { transform: [{ translateY: desplazamiento(entra) }] }]}
            >
              {pantalla(m)}
            </Animated.View>
          );
        })}
      </View>
    </EvitaTeclado>
  );
}

/** Marcas de regla (como una probeta) en el borde derecho de la cabecera. Decorativas. */
function Regla({ estilo, corta }: { estilo?: object; corta?: boolean }) {
  const marcas = corta ? 7 : 17;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', right: 0, alignItems: 'flex-end', gap: corta ? 6 : 8 }, estilo]}>
      {Array.from({ length: marcas }, (_, i) => (
        <View key={i} style={{ height: 1, width: i % 4 === 0 ? 30 : 16, backgroundColor: colores.regla }} />
      ))}
    </View>
  );
}

const est = crearEstilos(() => ({
  portada: {
    minHeight: 440, flexGrow: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espacio.xl, paddingBottom: espacio.xxl,
    backgroundColor: fondos.cabeceraAcceso, borderBottomRightRadius: CURVA * 1.5, overflow: 'hidden',
  },
  marca: { fontFamily: fuentes.bold, fontSize: 40, color: colores.marinoOscuro, letterSpacing: -0.8, textAlign: 'center', marginTop: espacio.l },
  nombre: { fontFamily: fuentes.semibold, fontSize: 15, color: colores.texto, textAlign: 'center', marginTop: 2 },
  lema: { fontFamily: fuentes.regular, fontSize: 14, color: colores.marinoOscuro, marginTop: espacio.l, textAlign: 'center' },
  pie: {
    flexGrow: 1, backgroundColor: fondos.superficieBlanca, borderTopLeftRadius: CURVA * 1.5,
    paddingHorizontal: espacio.xl, paddingTop: espacio.xxl,
  },
  cabecera: {
    backgroundColor: fondos.superficieBlanca, borderBottomRightRadius: CURVA * 1.5, overflow: 'hidden',
    paddingHorizontal: espacio.xl, paddingBottom: espacio.xl + espacio.s,
  },
  titulo: { fontFamily: fuentes.bold, fontSize: 28, color: colores.marinoOscuro, letterSpacing: -0.6, marginTop: espacio.m },
  sub: { fontFamily: fuentes.regular, fontSize: 13.5, color: colores.marinoOscuro, marginTop: espacio.xs },
  cuerpo: {
    flexGrow: 1, backgroundColor: fondos.cabeceraAcceso, borderTopLeftRadius: CURVA * 1.5,
    paddingHorizontal: espacio.xl, paddingTop: espacio.xl + espacio.s,
  },
  separador: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, marginVertical: espacio.l },
  linea: { flex: 1, height: 1, backgroundColor: colores.regla },
  ojo: { position: 'absolute', right: 14, top: 38 },
}));
