import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/** Dirección a la que Google vuelve después de iniciar sesión (ej. ceqapp://auth/callback). */
export const urlRetorno = () => Linking.createURL('auth/callback');

/**
 * Iniciar sesión con Google a través de Supabase (flujo PKCE).
 * Devuelve un mensaje de error para mostrar, o null si salió bien.
 */
export async function entrarConGoogle(): Promise<string | null> {
  const redirectTo = urlRetorno();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data?.url) return error?.message ?? 'No se pudo abrir Google.';

  const resultado = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (resultado.type !== 'success') return resultado.type === 'cancel' || resultado.type === 'dismiss' ? null : 'Se interrumpió el inicio de sesión.';

  const { queryParams } = Linking.parse(resultado.url);
  const errorGoogle = queryParams?.error_description ?? queryParams?.error;
  if (errorGoogle) return String(errorGoogle);
  const code = queryParams?.code;
  if (typeof code !== 'string') return 'Google no devolvió el código de acceso.';

  return canjearCodigo(code);
}

/**
 * Canjea el código de un enlace de retorno (Google o confirmación de correo)
 * por una sesión. En Android el mismo retorno puede llegar por dos caminos
 * (openAuthSessionAsync y la ruta auth/callback); se canjea una sola vez,
 * porque el segundo intento fallaría y mostraría un error falso.
 */
const canjes = new Map<string, Promise<string | null>>();
export function canjearCodigo(code: string): Promise<string | null> {
  let canje = canjes.get(code);
  if (!canje) {
    canje = supabase.auth.exchangeCodeForSession(code).then(({ error }) => (error ? error.message : null));
    canjes.set(code, canje);
  }
  return canje;
}

export async function entrarConCorreo(correo: string, clave: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
  return error ? traducirError(error.message) : null;
}

export async function registrarseConCorreo(correo: string, clave: string, nombre: string): Promise<string | null> {
  const { error } = await supabase.auth.signUp({
    email: correo.trim(),
    password: clave,
    options: { data: { full_name: nombre.trim() }, emailRedirectTo: urlRetorno() },
  });
  return error ? traducirError(error.message) : null;
}

export async function salir() {
  await supabase.auth.signOut();
}

function traducirError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Confirmá tu correo antes de entrar. Revisá tu bandeja.';
  if (m.includes('already registered')) return 'Ese correo ya tiene una cuenta.';
  if (m.includes('password')) return 'La contraseña debe tener al menos 6 caracteres.';
  return msg;
}
