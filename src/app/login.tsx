import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BotonProveedor } from '../components/BotonProveedor';
import { Aparecer } from '../components/movimiento';
import { LogoAcceso } from '../components/LogoAcceso';
import { Boton, Campo, EvitaTeclado, Mensaje, s } from '../components/ui';
import { problemaRegistro, type ModoAcceso, type Proveedor } from '../lib/acceso';
import { leerModoInicial } from '../lib/accesoGuardado';
import { entrarConCorreo, entrarConGoogle, entrarConMicrosoft, pedirRecuperarClave, proveedoresDisponibles, registrarseConCorreo } from '../lib/auth';
import { CLAVE_MINIMA, correoValido } from '../lib/recuperacion';
import { supabaseConfigurado } from '../lib/supabase';
import { colores, crearEstilos, espacio, fondos, fuentes } from '../tema';
import { useTema } from '../context/TemaProvider';

const ENTRAR_CON: Record<Proveedor, () => Promise<string | null>> = { google: entrarConGoogle, microsoft: entrarConMicrosoft };

/** Radio de las curvas de las cabeceras celestes. */
const CURVA = 44;

/**
 * Acceso. La primera vez en el celular se ve la portada (Iniciar sesión /
 * Crear cuenta). Desde que se entró una vez, después de cerrar sesión se va
 * directo a "Iniciar sesión". En cada formulario, abajo, Google y Microsoft.
 */
export default function Login() {
  useTema();
  const insets = useSafeAreaInsets();
  const [modo, setModo] = useState<ModoAcceso | null>(null);
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
    leerModoInicial().then((m) => activo && setModo((actual) => actual ?? m));
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
    setModo(m);
    setError(null);
    setInfo(null);
    setVerClave(false);
  };

  // Botón Atrás de Android: vuelve a la pantalla anterior del acceso en vez de cerrar la app.
  useEffect(() => {
    if (modo == null || modo === 'portada') return;
    const destino: ModoAcceso = modo === 'recuperar' ? 'entrar' : 'portada';
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cambiarModo(destino);
      return true;
    });
    return () => sub.remove();
  }, [modo]);

  const problema = problemaRegistro({ nombre, apellido, correoOk: correoValido(correo), clave, repetida }, CLAVE_MINIMA);

  const crearCuenta = async () => {
    if (problema) return setError(problema);
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

  if (modo === null) return <View style={{ flex: 1, backgroundColor: fondos.cabeceraAcceso }} />;

  if (modo === 'portada') {
    return (
      <View style={{ flex: 1, backgroundColor: fondos.superficieBlanca }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
          <View style={[est.portada, { paddingTop: insets.top + espacio.xxl }]}>
            <Regla estilo={{ top: '30%' }} />
            <Aparecer estilo={{ alignItems: 'center' }}>
              <LogoAcceso tamano={112} />
              <Text style={est.marca} accessibilityRole="header">Portal CEQ</Text>
              <Text style={est.nombre}>Centro de Estudiantes de Química</Text>
              <Text style={est.lema}>Tu vida académica en la FCQ, en un solo lugar.</Text>
            </Aparecer>
          </View>
          <View style={{ backgroundColor: fondos.cabeceraAcceso, flexGrow: 1 }}>
            <View style={[est.pie, { paddingBottom: insets.bottom + espacio.xl }]}>
              <Aparecer retraso={120} estilo={{ width: '100%', maxWidth: 440, alignSelf: 'center', gap: espacio.s }}>
                {avisoConfig}
                <Boton texto="Iniciar sesión" onPress={() => cambiarModo('entrar')} />
                <Boton texto="Crear cuenta" variante="secundario" onPress={() => cambiarModo('registro')} />
              </Aparecer>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  /** Google y Microsoft, debajo del formulario. */
  const otrasCuentas = (
    <>
      <View style={est.separador}>
        <View style={est.linea} />
        <Text style={s.filaDetalle}>o</Text>
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

  if (modo === 'recuperar') {
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
        <Text style={[s.filaDetalle, { marginTop: espacio.m }]}>Si entrás con Google o Microsoft, recuperá tu contraseña desde esa cuenta.</Text>
        {mensajes}
      </>
    );
  } else if (modo === 'entrar') {
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
          deshabilitado={!correo || !clave || ocupado}
          onPress={() => ejecutar('correo', () => entrarConCorreo(correo, clave))}
        />
        <Pressable onPress={() => cambiarModo('recuperar')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', padding: espacio.s, marginTop: espacio.xs }}>
          <Text style={s.enlace}>¿Olvidaste tu contraseña?</Text>
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
          ayuda={repetida && repetida !== clave ? 'Las dos contraseñas no coinciden.' : undefined}
        />
        {/* Activo aunque falten datos: al tocarlo dice qué falta. */}
        <Boton texto="Crear cuenta" cargando={cargando === 'correo'} deshabilitado={ocupado} onPress={crearCuenta} />
        {mensajes}
        {otrasCuentas}
      </>
    );
  }

  return (
    <EvitaTeclado estilo={{ backgroundColor: fondos.superficieBlanca }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        {/* key: al cambiar de pantalla, la nueva entra subiendo como en la maqueta. */}
        <Aparecer key={modo} distancia={48} estilo={{ flexGrow: 1 }}>
          <View style={[est.cabecera, { paddingTop: insets.top + espacio.l }]}>
            <Regla estilo={{ top: insets.top + espacio.s }} corta />
            <Pressable onPress={() => cambiarModo(volverA)} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={10} style={{ alignSelf: 'flex-start', paddingVertical: espacio.xs }}>
              <Ionicons name="arrow-back" size={24} color={colores.marinoOscuro} />
            </Pressable>
            <Text style={est.titulo} accessibilityRole="header">{titulo}</Text>
            <Text style={est.sub}>{sub}</Text>
          </View>
          <View style={[est.cuerpo, { paddingBottom: insets.bottom + espacio.xl }]}>
            <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
              {avisoConfig}
              {cuerpo}
            </View>
          </View>
        </Aparecer>
      </ScrollView>
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
    backgroundColor: fondos.cabeceraAcceso, borderBottomRightRadius: CURVA * 1.5, overflow: 'hidden',
    paddingHorizontal: espacio.xl, paddingBottom: espacio.xl + espacio.s,
  },
  titulo: { fontFamily: fuentes.bold, fontSize: 28, color: colores.marinoOscuro, letterSpacing: -0.6, marginTop: espacio.m },
  sub: { fontFamily: fuentes.regular, fontSize: 13.5, color: colores.marinoOscuro, marginTop: espacio.xs },
  cuerpo: { flexGrow: 1, backgroundColor: fondos.superficieBlanca, paddingHorizontal: espacio.xl, paddingTop: espacio.xl },
  separador: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, marginVertical: espacio.l },
  linea: { flex: 1, height: 1, backgroundColor: fondos.linea },
  ojo: { position: 'absolute', right: 14, top: 38 },
}));
