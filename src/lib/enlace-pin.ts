/**
 * Enlace del correo para recuperar el PIN (ceqapp://auth/pin?code=...).
 *
 * El enlace puede llegar con la app desbloqueada (ruta auth/pin), bloqueada
 * (el bloqueo tapa las rutas) o justo cuando la app se bloquea al volver del
 * correo. Por eso el canje no depende de ninguna pantalla: se hace acá, una
 * sola vez por código, y el resultado queda guardado hasta que lo tome la
 * pantalla de "¿Olvidaste tu PIN?" (la del bloqueo o la de Perfil), aunque se
 * monte después. El resultado vence a los 15 minutos y se olvida al salir.
 * Sin React Native, para probarlo con node --test.
 */

export type EnlacePin = { code: string; flowId: string | null } | { error: string };
export type ResultadoPin = { tipo: 'canjeando' } | { tipo: 'confirmado' } | { tipo: 'error'; mensaje: string };

const VIGENCIA_MS = 15 * 60_000;
/** Cuánto se espera el enlace después de pedirlo (Supabase lo vence a la hora). */
export const ESPERA_ENLACE_MS = 60 * 60_000;
const MAX_USADOS = 20;

/**
 * Lo que queda guardado en el celular entre aperturas de la app: cuándo se
 * pidió el último enlace y qué enlaces ya se atendieron. Hace falta porque
 * Android, al reabrir la app desde Recientes (o cuando el sistema la cerró),
 * vuelve a entregar el enlace con el que se abrió la última vez: sin esto, el
 * mismo código ya usado se volvía a canjear en cada apertura y salía
 * "código inválido".
 */
export interface EstadoEnlace { pedido: number | null; usados: string[] }
export interface MemoriaEnlace {
  leer(): Promise<EstadoEnlace>;
  guardar(e: EstadoEnlace): Promise<void>;
}

/** Lee lo guardado aunque esté vacío o roto. */
export function leerEstadoEnlace(texto: string | null | undefined): EstadoEnlace {
  try {
    const o = texto ? (JSON.parse(texto) as Partial<EstadoEnlace>) : null;
    return {
      pedido: typeof o?.pedido === 'number' ? o.pedido : null,
      usados: Array.isArray(o?.usados) ? o.usados.filter((u): u is string => typeof u === 'string').slice(-MAX_USADOS) : [],
    };
  } catch {
    return { pedido: null, usados: [] };
  }
}

/** Se pidió un enlace nuevo: se espera desde ahora (los errores anteriores ya no cuentan). */
export function estadoAlPedir(e: EstadoEnlace, ahora = Date.now()): EstadoEnlace {
  return { pedido: ahora, usados: e.usados.filter((u) => !u.startsWith('error:')) };
}

/** Clave con la que se recuerda un enlace atendido. */
export const claveEnlace = (e: EnlacePin) => ('error' in e ? `error:${e.error}` : e.code);

/**
 * Si hay que atender el enlace: solo si se pidió uno en este celular hace
 * menos de una hora y ese mismo enlace no se atendió antes.
 */
export function hayQueAtender(e: EstadoEnlace, clave: string, ahora = Date.now()): boolean {
  if (e.pedido == null || ahora - e.pedido > ESPERA_ENLACE_MS || ahora < e.pedido - 60_000) return false;
  return !e.usados.includes(clave);
}

export function marcarAtendido(e: EstadoEnlace, clave: string): EstadoEnlace {
  return { ...e, usados: [...e.usados.filter((u) => u !== clave), clave].slice(-MAX_USADOS) };
}

/** Lo que trae un enlace de recuperar PIN, o null si la dirección es otra. */
export function leerEnlacePin(url: string | null | undefined): EnlacePin | null {
  if (!url || !/auth\/pin(?:[/?#]|$)/.test(url)) return null;
  const param = (nombre: string) => {
    const m = new RegExp(`[?&#]${nombre}=([^&#]*)`).exec(url);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  };
  const code = param('code');
  if (code) return { code, flowId: param('sb_flow_id') };
  return { error: param('error_description') ?? param('error') ?? 'El enlace no es válido.' };
}

let actual: { r: ResultadoPin; desde: number } | null = null;
let comprobando = 0;
const oyentes = new Set<() => void>();
const vistos = new Set<string>();
let ultimoError: { texto: string; desde: number } | null = null;

const avisar = () => oyentes.forEach((f) => f());
function fijar(r: ResultadoPin | null, ahora = Date.now()) {
  actual = r ? { r, desde: ahora } : null;
  avisar();
}

/** Todavía se está viendo si un enlace recién llegado hay que atenderlo. */
export const hayEnlaceComprobando = () => comprobando > 0;

/** Con memoria: false si el enlace es viejo o no se pidió; si hay que atenderlo, lo marca. */
async function atenderSegunMemoria(clave: string, memoria: MemoriaEnlace): Promise<boolean> {
  comprobando++;
  try {
    const e = await memoria.leer();
    if (!hayQueAtender(e, clave)) return false;
    await memoria.guardar(marcarAtendido(e, clave));
    return true;
  } catch {
    // Sin poder leer el celular, se atiende como antes (mejor un aviso de más que perder el enlace).
    return true;
  } finally {
    comprobando--;
  }
}

/**
 * Procesa un enlace recibido. Cada código se canjea una sola vez (puede
 * llegar por dos caminos); un enlace con error siempre se avisa.
 * `canjear` devuelve null si el enlace es de la cuenta de la sesión, o el error.
 */
export async function procesarEnlacePin(
  e: EnlacePin,
  canjear: (code: string, flowId: string | null) => Promise<string | null>,
  espera = 20_000,
  memoria?: MemoriaEnlace,
) {
  if (!('error' in e)) {
    if (vistos.has(e.code)) return;
    vistos.add(e.code);
  }
  // Un enlace viejo (Android lo vuelve a entregar al reabrir) o que no se pidió
  // en este celular se ignora sin avisar nada.
  if (memoria && !(await atenderSegunMemoria(claveEnlace(e), memoria))) {
    avisar();
    return;
  }
  if ('error' in e) {
    // El mismo enlace con error llega por dos caminos casi juntos: se avisa una vez.
    const ahora = Date.now();
    if (ultimoError && ultimoError.texto === e.error && ahora - ultimoError.desde < 5_000) return;
    ultimoError = { texto: e.error, desde: ahora };
    // Un enlace con error no pisa una confirmación que todavía nadie tomó.
    if (actual && actual.r.tipo !== 'error') return;
    fijar({ tipo: 'error', mensaje: 'El enlace venció o ya se usó. Pedí uno nuevo.' });
    return;
  }
  fijar({ tipo: 'canjeando' });
  // Sin respuesta en un tiempo razonable (conexión trabada), se avisa y se puede seguir.
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<string>((ok) => {
    reloj = setTimeout(() => ok('No pudimos comprobar el enlace: revisá tu conexión y pedí uno nuevo.'), espera);
  });
  const r = await Promise.race([canjear(e.code, e.flowId).catch(() => 'No se pudo confirmar. Probá de nuevo.'), limite]);
  clearTimeout(reloj);
  if (r === null && memoria) {
    // Ya se recuperó: no se espera otro enlace.
    await memoria.leer().then((m) => memoria.guardar({ ...m, pedido: null })).catch(() => {});
  }
  fijar(r === null ? { tipo: 'confirmado' } : { tipo: 'error', mensaje: r });
}

/** El resultado del último enlace (si no venció), sin tomarlo. */
export function resultadoPin(ahora = Date.now()): ResultadoPin | null {
  if (actual && ahora - actual.desde > VIGENCIA_MS && actual.r.tipo !== 'canjeando') actual = null;
  return actual?.r ?? null;
}

/** Toma el resultado final (confirmado o error) para usarlo una sola vez. */
export function tomarResultadoPin(ahora = Date.now()): ResultadoPin | null {
  const r = resultadoPin(ahora);
  if (!r || r.tipo === 'canjeando') return r;
  actual = null;
  return r;
}

/** Avisa cada vez que cambia el resultado. */
export function escucharResultadoPin(f: () => void): () => void {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

let pantallas = 0;
/** "¿Olvidaste tu PIN?" está abierta (y tomará el resultado). Devuelve cómo avisar que se cerró. */
export function abrirPantallaPin(): () => void {
  pantallas++;
  return () => {
    pantallas--;
  };
}
export const hayPantallaPin = () => pantallas > 0;

/** Al cerrar sesión: un resultado guardado no sirve para la próxima cuenta. */
export function olvidarEnlacePin() {
  fijar(null);
}

/** Solo para las pruebas. */
export function reiniciarEnlacePin() {
  actual = null;
  oyentes.clear();
  vistos.clear();
  ultimoError = null;
  pantallas = 0;
  comprobando = 0;
}
