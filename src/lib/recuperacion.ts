/**
 * Reglas puras para recuperar el PIN y la contraseña (sin React Native, para
 * poder probarlas con node --test).
 */

export const CLAVE_MINIMA = 6;

/** Datos del usuario de Supabase que importan para saber cómo puede confirmar quién es. */
export interface UsuarioCuenta {
  email?: string | null;
  app_metadata?: { provider?: string; providers?: string[] } | null;
  identities?: { provider: string }[] | null;
}

export interface MetodosCuenta {
  /** Entró alguna vez con Google. No sirve para recuperar el PIN: quien tiene el celular ya tiene esa cuenta abierta. */
  google: boolean;
  /** Entró alguna vez con Microsoft (en Supabase se llama "azure"). Tampoco sirve para recuperar el PIN. */
  microsoft: boolean;
  /** Tiene contraseña propia (cuenta creada con correo): puede confirmar escribiéndola. */
  clave: boolean;
  correo: string | null;
}

/** Con qué puede confirmar la persona que es la dueña de la cuenta. */
export function metodosDeCuenta(usuario: UsuarioCuenta | null | undefined): MetodosCuenta {
  const proveedores = new Set<string>();
  for (const p of usuario?.app_metadata?.providers ?? []) proveedores.add(p);
  if (usuario?.app_metadata?.provider) proveedores.add(usuario.app_metadata.provider);
  for (const i of usuario?.identities ?? []) proveedores.add(i.provider);
  const correo = usuario?.email?.trim() || null;
  return { google: proveedores.has('google'), microsoft: proveedores.has('azure'), clave: proveedores.has('email') && correo != null, correo };
}

/** Motivo por el que la contraseña nueva no sirve, o null si está bien. */
export function problemaClaveNueva(clave: string, repetida: string): string | null {
  if (clave.length < CLAVE_MINIMA) return `La contraseña tiene que tener al menos ${CLAVE_MINIMA} caracteres.`;
  if (clave.trim().length === 0) return 'La contraseña no puede ser solo espacios.';
  if (clave !== repetida) return 'Las dos contraseñas no coinciden.';
  return null;
}

/** Correo con forma razonable (el servidor hace la comprobación real). */
export function correoValido(correo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());
}

/** Pasa a castellano los errores de Supabase al recuperar o cambiar la contraseña. */
export function traducirErrorClave(mensaje: string | null | undefined): string {
  const m = (mensaje ?? '').toLowerCase();
  if (!m) return 'No se pudo completar. Probá de nuevo.';
  if (m.includes('code verifier') || m.includes('code_verifier') || m.includes('flow state'))
    return 'Este enlace se pidió desde otro dispositivo o ya se usó. Abrilo en el mismo celular donde lo pediste, o pedí uno nuevo.';
  if (m.includes('expired') || (m.includes('invalid') && m.includes('link')) || m.includes('otp'))
    return 'El enlace venció o ya se usó. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".';
  if (m.includes('same') || m.includes('different from the old'))
    return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if (m.includes('weak') || m.includes('at least') || m.includes('should be') || m.includes('characters'))
    return `La contraseña es muy débil. Usá al menos ${CLAVE_MINIMA} caracteres, mezclando letras y números.`;
  if (m.includes('rate limit') || m.includes('security purposes') || m.includes('too many'))
    return 'Ya pediste un correo hace poco. Esperá unos minutos y probá de nuevo.';
  if (m.includes('session') && (m.includes('missing') || m.includes('not found')))
    return 'Tu sesión se cerró. Pedí un enlace nuevo desde "¿Olvidaste tu contraseña?".';
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'La contraseña no es correcta.';
  if (m.includes('fetch') || m.includes('network')) return 'No hay conexión. Revisá tu internet y probá de nuevo.';
  return mensaje ?? 'No se pudo completar. Probá de nuevo.';
}

/**
 * ¿El correo que escribió la persona es el de su cuenta? Antes de mandar el
 * enlace para recuperar el PIN se pide escribirlo: quien solo tiene el
 * celular en la mano no puede pedirlo sin saber cuál es.
 */
export function mismoCorreo(escrito: string, deLaCuenta: string | null | undefined): boolean {
  const a = escrito.trim().toLowerCase();
  const b = (deLaCuenta ?? '').trim().toLowerCase();
  return a.length > 0 && a === b;
}

/** "ana.gimenez@gmail.com" → "an•••••••@gmail.com": se reconoce sin mostrarlo entero. */
export function correoEnmascarado(correo: string | null | undefined): string {
  const c = (correo ?? '').trim();
  const arroba = c.lastIndexOf('@');
  if (arroba < 1) return c ? '•••' : '';
  const usuario = c.slice(0, arroba);
  const visible = usuario.length <= 2 ? usuario.slice(0, 1) : usuario.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(3, usuario.length - visible.length))}${c.slice(arroba)}`;
}
