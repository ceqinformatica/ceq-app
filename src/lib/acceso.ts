/**
 * Reglas puras de la pantalla de acceso (sin React Native, para probarlas
 * con node --test): qué pantalla ver primero y cómo tomar el resultado de
 * crear una cuenta con correo.
 */

/** Pantallas de acceso. */
export type ModoAcceso = 'registro' | 'entrar' | 'recuperar';

/** Clave en el celular: "1" si alguna vez se entró con una cuenta en este dispositivo. */
export const CLAVE_YA_ENTRO = 'ceq.acceso.yaEntro';

/**
 * La primera vez se ve "Crear cuenta". Si en este celular ya se entró
 * alguna vez (y después se cerró sesión), se ve "Iniciar sesión".
 */
export function modoInicial(guardado: string | null | undefined): 'registro' | 'entrar' {
  return guardado === '1' ? 'entrar' : 'registro';
}

/** Lo que devuelve Supabase al crear una cuenta con correo (solo lo que importa). */
export interface RespuestaRegistro {
  session: unknown | null;
  user: { identities?: unknown[] | null } | null;
}

/**
 * - 'adentro': la cuenta quedó creada y ya hay sesión (confirmación de correo apagada).
 * - 'confirmar': se creó, pero hay que abrir el enlace del correo antes de entrar.
 * - 'ya-existe': ese correo ya tenía cuenta. Con la confirmación de correo
 *   encendida, Supabase no da error (para no revelar qué correos existen) y
 *   devuelve un usuario sin identidades.
 */
export function resultadoRegistro(r: RespuestaRegistro): 'adentro' | 'confirmar' | 'ya-existe' {
  if (r.session) return 'adentro';
  if (r.user && Array.isArray(r.user.identities) && r.user.identities.length === 0) return 'ya-existe';
  return 'confirmar';
}

/** Nombre visible de cada forma de entrar con otra cuenta. */
export const NOMBRE_PROVEEDOR = { google: 'Google', microsoft: 'Microsoft' } as const;
export type Proveedor = keyof typeof NOMBRE_PROVEEDOR;

/**
 * Qué botones de otras cuentas mostrar según la configuración pública de
 * Supabase (GET /auth/v1/settings). Google se muestra siempre; Microsoft solo
 * cuando está habilitado, así nadie toca un botón que todavía no anda.
 */
export function proveedoresVisibles(ajustes: { external?: Record<string, unknown> } | null | undefined): Proveedor[] {
  return ajustes?.external?.azure === true ? ['google', 'microsoft'] : ['google'];
}
