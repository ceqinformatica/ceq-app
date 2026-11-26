import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { olvidarEsteCelular } from './notificaciones';
import { desactivarBiometria } from './biometria';
import { borrarPin } from './pinGuardado';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { estadoAlPedir, leerEnlacePin, leerEstadoEnlace, olvidarEnlacePin, procesarEnlacePin, type MemoriaEnlace } from './enlace-pin';
import { traducirErrorClave } from './recuperacion';
import { NOMBRE_PROVEEDOR, proveedoresVisibles, resultadoRegistro, urlParaCorreo, type Proveedor } from './acceso';

WebBrowser.maybeCompleteAuthSession();

/** Dirección a la que Google vuelve después de iniciar sesión (ej. ceqapp://auth/callback). */
export const urlRetorno = () => Linking.createURL('auth/callback');

/** Para el correo de confirmación: pasa por la página del CEQ (ver PAGINA_ENLACES). */
const urlConfirmacion = () => urlParaCorreo(urlRetorno(), 'auth/callback');

/**
 * Cliente "web" de Google (proyecto ceq-app-515510). No es secreto: es el
 * mismo que usa Supabase. El selector nativo de Android pide un token para
 * este cliente; el cliente Android (paquete + huella SHA-1) solo autoriza
 * a la app a pedirlo.
 */
const CLIENTE_WEB_GOOGLE = '689206343818-a4p0nn7kg372rlr5jg7a6l8cp0l527ir.apps.googleusercontent.com';

/**
 * Iniciar sesión con Google. En Android usa el selector de cuentas nativo
 * (no aparece la dirección de Supabase); si no está disponible, cae al
 * navegador. Devuelve un mensaje de error para mostrar, o null si salió bien.
 */
export async function entrarConGoogle(): Promise<string | null> {
  if (Platform.OS === 'android') {
    const nativo = await entrarConGoogleNativo();
    if (nativo !== 'usar-navegador') return nativo;
  }
  return entrarConGoogleNavegador();
}

async function entrarConGoogleNativo(): Promise<string | null | 'usar-navegador'> {
  let modulo: typeof import('@react-native-google-signin/google-signin');
  try {
    modulo = require('@react-native-google-signin/google-signin');
  } catch {
    return 'usar-navegador'; // Expo Go u otra compilación sin el módulo nativo
  }
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = modulo;
  try {
    GoogleSignin.configure({ webClientId: CLIENTE_WEB_GOOGLE });
    // Sin el cartel de "instalá Servicios de Google Play": en los Huawei sin
    // Google no se puede instalar, y la app entra igual por el navegador.
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
    // Siempre deja elegir la cuenta, como el prompt=select_account del navegador.
    await GoogleSignin.signOut().catch(() => {});
    const respuesta = await GoogleSignin.signIn();
    if (!isSuccessResponse(respuesta)) return null; // canceló
    const idToken = respuesta.data.idToken;
    if (!idToken) return 'usar-navegador';
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    // Si Supabase rechaza el token (configuración incompleta), mejor entrar
    // por el navegador que dejar a la persona afuera.
    if (error) console.warn('Login nativo rechazado por Supabase:', error.message);
    return error ? 'usar-navegador' : null;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (e.code === statusCodes.IN_PROGRESS) return null;
    }
    // DEVELOPER_ERROR (huella SHA-1 sin registrar), sin Play Services, etc.:
    // se intenta por el navegador para que nadie se quede sin entrar.
    return 'usar-navegador';
  }
}

const entrarConGoogleNavegador = () => entrarConNavegador('google');

/**
 * Iniciar sesión con una cuenta de Microsoft (Outlook, Hotmail, Live o una
 * cuenta de trabajo o facultad). Se abre la página de Microsoft en el navegador.
 */
export const entrarConMicrosoft = () => entrarConNavegador('microsoft');

async function entrarConNavegador(proveedor: Proveedor): Promise<string | null> {
  const redirectTo = urlRetorno();
  const { data, error } = await supabase.auth.signInWithOAuth({
    // En Supabase, Microsoft se llama "azure".
    provider: proveedor === 'microsoft' ? 'azure' : 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Microsoft necesita el permiso "email" para dar el correo de la cuenta.
      scopes: proveedor === 'microsoft' ? 'email' : undefined,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error || !data?.url) return traducirErrorProveedor(error?.message, proveedor);

  const resultado = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (resultado.type !== 'success') return resultado.type === 'cancel' || resultado.type === 'dismiss' ? null : 'Se interrumpió el inicio de sesión.';

  const { queryParams } = Linking.parse(resultado.url);
  const errorRetorno = queryParams?.error_description ?? queryParams?.error;
  if (errorRetorno) return traducirErrorProveedor(String(errorRetorno), proveedor);
  const code = queryParams?.code;
  if (typeof code !== 'string') return `${NOMBRE_PROVEEDOR[proveedor]} no devolvió el código de acceso.`;

  return canjearCodigo(code);
}

/**
 * Canjea el código de un enlace de retorno (Google o confirmación de correo)
 * por una sesión. En Android el mismo retorno puede llegar por dos caminos
 * (openAuthSessionAsync y la ruta auth/callback); se canjea una sola vez,
 * porque el segundo intento fallaría y mostraría un error falso.
 */
const canjes = new Map<string, Promise<string | null>>();
export function canjearCodigo(code: string, flowId: string | null = null): Promise<string | null> {
  let canje = canjes.get(code);
  if (!canje) {
    canje = supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined).then(({ error }) => (error ? error.message : null));
    canjes.set(code, canje);
  }
  return canje;
}

export async function entrarConCorreo(correo: string, clave: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
  return error ? traducirError(error.message) : null;
}

/**
 * Crea la cuenta con correo y contraseña. Si Supabase no pide confirmar el
 * correo, la persona queda adentro al instante ('adentro'); si lo pide, tiene
 * que abrir el enlace del correo ('confirmar'). 'ya-existe' si ese correo ya
 * tenía cuenta. O un mensaje de error.
 */
export async function registrarseConCorreo(
  correo: string,
  clave: string,
  nombre: string,
): Promise<{ resultado: 'adentro' | 'confirmar' | 'ya-existe' } | { error: string }> {
  const { data, error } = await supabase.auth.signUp({
    email: correo.trim(),
    password: clave,
    options: { data: { full_name: nombre.trim() }, emailRedirectTo: urlConfirmacion() },
  });
  if (error) {
    if (error.message.toLowerCase().includes('already registered')) return { resultado: 'ya-existe' };
    return { error: traducirError(error.message) };
  }
  return { resultado: resultadoRegistro(data) };
}

/**
 * Botones de otras cuentas que se pueden mostrar (cada uno solo si está
 * habilitado en Supabase). Sin internet, solo Google.
 */
export async function proveedoresDisponibles(): Promise<Proveedor[]> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return proveedoresVisibles(null);
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: clave } });
    return proveedoresVisibles(r.ok ? await r.json() : null);
  } catch {
    return proveedoresVisibles(null);
  }
}

/** Dirección del enlace del correo para elegir una contraseña nueva. */
export const urlRestablecer = () => urlParaCorreo(Linking.createURL('auth/restablecer'), 'auth/restablecer');

/**
 * Manda el correo con el enlace para elegir una contraseña nueva. Por
 * seguridad, la respuesta es la misma exista o no una cuenta con ese correo.
 * El enlace hay que abrirlo en este mismo dispositivo (PKCE).
 */
export async function pedirRecuperarClave(correo: string): Promise<string | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), { redirectTo: urlRestablecer() });
  return error ? traducirErrorClave(error.message) : null;
}

/** Guarda la contraseña nueva de la cuenta con la que hay sesión. */
export async function cambiarClave(nueva: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ password: nueva });
  return error ? traducirErrorClave(error.message) : null;
}

/** Dirección del enlace del correo para recuperar el PIN. */
export const urlEnlacePin = () => urlParaCorreo(Linking.createURL('auth/pin'), 'auth/pin');

const paraPin = (m: string) => m.replace('"¿Olvidaste tu contraseña?"', '"¿Olvidaste tu PIN?"');

/**
 * Manda a la cuenta con la que hay sesión un enlace de un solo uso para
 * recuperar el PIN. No crea cuentas. El enlace solo sirve en este mismo
 * celular (PKCE: el verificador queda guardado acá).
 */
export async function pedirEnlacePin(correo: string): Promise<string | null> {
  // Desde ahora se espera el enlace (antes de mandarlo, por si llega enseguida).
  await memoriaEnlace.leer().then((e) => memoriaEnlace.guardar(estadoAlPedir(e))).catch(() => {});
  const { error } = await supabase.auth.signInWithOtp({
    email: correo.trim(),
    options: { shouldCreateUser: false, emailRedirectTo: urlEnlacePin() },
  });
  return error ? paraPin(traducirErrorClave(error.message)) : null;
}

/**
 * Canjea el código del enlace del PIN. Devuelve null si el enlace es de la
 * MISMA cuenta de la sesión. Si es de otra cuenta, Supabase ya cambió la
 * sesión: se cierra (como con Google de otra cuenta) y se devuelve el error.
 */
export async function confirmarConEnlace(code: string, flowId: string | null = null): Promise<string | null> {
  const uidAntes = (await supabase.auth.getSession()).data.session?.user.id ?? null;
  // Sin sesión no hay PIN que recuperar: no se canjea (abriría otra sesión).
  if (!uidAntes) return 'Abrí el enlace con la sesión iniciada en este celular.';
  const e = await canjearCodigo(code, flowId);
  if (e) return paraPin(traducirErrorClave(e));
  const uid = (await supabase.auth.getSession()).data.session?.user.id ?? null;
  if (uid !== uidAntes) {
    if (await salir()) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    return 'Ese enlace es de otra cuenta. Cerramos la sesión por seguridad: entrá de nuevo con tu cuenta.';
  }
  return null;
}

/** Enlaces pedidos y ya atendidos en este celular (sobrevive a cerrar la app). */
const CLAVE_ENLACE = 'ceq.enlacePin';
const memoriaEnlace: MemoriaEnlace = {
  leer: async () => leerEstadoEnlace(await AsyncStorage.getItem(CLAVE_ENLACE)),
  guardar: (e) => AsyncStorage.setItem(CLAVE_ENLACE, JSON.stringify(e)),
};

/**
 * Si la dirección es un enlace de recuperar PIN, lo canjea: una sola vez por
 * código (también entre aperturas de la app) y solo si se pidió en este
 * celular hace menos de una hora.
 */
export function recibirEnlacePin(url: string | null | undefined) {
  const e = leerEnlacePin(url);
  if (e) void procesarEnlacePin(e, confirmarConEnlace, undefined, memoriaEnlace);
}

/**
 * Confirma que quien tiene el celular es el dueño de la cuenta, para poder
 * crear un PIN nuevo si lo olvidó. Devuelve null si la contraseña es la de
 * la cuenta, o el mensaje de error. No cierra la sesión si se equivoca.
 */
export async function confirmarConClave(correo: string, clave: string): Promise<string | null> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
  if (error || !data.session) return traducirErrorClave(error?.message ?? 'Invalid login credentials');
  return null;
}

const oyentesFalloSalida = new Set<() => void>();
/** Avisa cuando un cierre de sesión dio de baja el celular pero la sesión siguió abierta. */
export function alFallarSalida(f: () => void): () => void {
  oyentesFalloSalida.add(f);
  return () => oyentesFalloSalida.delete(f);
}

/**
 * Cierra la sesión. Devuelve null si salió, o el mensaje de error. Si algo
 * falla (por ejemplo, sin conexión), no se toca el PIN: la cuenta sigue
 * abierta y protegida igual que antes, y se puede volver a intentar.
 */
export async function salir(): Promise<string | null> {
  // Primero se borra el celular (después ya no hay sesión para hacerlo).
  try {
    await olvidarEsteCelular();
  } catch {
    return 'No pudimos cerrar la sesión: revisá tu conexión e intentá de nuevo.';
  }
  const { error } = await supabase.auth.signOut();
  if (error) {
    // El celular ya se dio de baja pero la sesión sigue: hay que volver a registrarlo.
    oyentesFalloSalida.forEach((f) => f());
    return 'No pudimos cerrar la sesión: revisá tu conexión e intentá de nuevo.';
  }
  await cerrarGoogleNativo();
  olvidarEnlacePin();
  // Un enlace pedido por esta cuenta no se espera más (los ya usados se siguen recordando).
  await memoriaEnlace.leer().then((e) => memoriaEnlace.guardar({ ...e, pedido: null })).catch(() => {});
  // El PIN NO se borra al salir: si no, cualquiera con el celular cerraba
  // sesión, volvía a entrar con la cuenta de Google del celular y quedaba
  // adentro sin PIN. Al volver a entrar con esta cuenta se pide el PIN; si lo
  // olvidó, "¿Olvidaste tu PIN?" permite crear otro confirmando la cuenta.
  return null;
}

/** Olvida la cuenta elegida en el selector nativo (para poder elegir otra). */
async function cerrarGoogleNativo() {
  if (Platform.OS !== 'android') return;
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // sin módulo nativo o sin cuenta: nada que cerrar
  }
}

/**
 * Borra la cuenta y todos los datos del usuario (lo exige Google Play).
 * Devuelve un mensaje de error, o null si se borró.
 */
export async function eliminarCuenta(): Promise<string | null> {
  // Los celulares registrados se borran en cascada con la cuenta.
  const { error } = await supabase.rpc('eliminar_mi_cuenta');
  if (error) return 'No se pudo borrar la cuenta. Probá de nuevo o escribí a informatica@ceq-una.com.';
  await desactivarBiometria().catch(() => {});
  await borrarPin().catch(() => {});
  await cerrarGoogleNativo();
  // El usuario ya no existe en el servidor: se cierra la sesión solo en este celular.
  await supabase.auth.signOut({ scope: 'local' });
  return null;
}

function traducirError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Confirmá tu correo antes de entrar. Revisá tu bandeja.';
  if (m.includes('already registered')) return 'Ese correo ya tiene una cuenta.';
  if (m.includes('password')) return 'La contraseña debe tener al menos 6 caracteres.';
  return msg;
}

/** Pasa a castellano lo que devuelven Google o Microsoft cuando algo sale mal. */
function traducirErrorProveedor(msg: string | null | undefined, proveedor: Proveedor): string {
  const nombre = NOMBRE_PROVEEDOR[proveedor];
  const m = (msg ?? '').toLowerCase();
  if (!m) return `No se pudo abrir ${nombre}.`;
  if (m.includes('provider is not enabled') || m.includes('unsupported provider'))
    return `Entrar con ${nombre} todavía no está habilitado. Usá otra opción por ahora.`;
  if (m.includes('email') && (m.includes('missing') || m.includes('not') || m.includes('verified')))
    return `Tu cuenta de ${nombre} no compartió un correo. Probá con otra opción.`;
  if (m.includes('access_denied') || m.includes('cancel')) return `Cancelaste el acceso con ${nombre}.`;
  if (m.includes('fetch') || m.includes('network')) return 'No hay conexión. Revisá tu internet y probá de nuevo.';
  return msg ?? `No se pudo abrir ${nombre}.`;
}
