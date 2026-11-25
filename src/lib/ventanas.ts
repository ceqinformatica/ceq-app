/**
 * Ventanas flotantes que arma el CEQ desde el panel: cuál mostrar, cuándo
 * y con qué colores. Sin React ni Supabase, para poder probarlo.
 */
import type { ColorVentana, FrecuenciaVentana, VentanaDb } from './tipos-db';

/**
 * Valor guardado para "Según el tema del usuario": cada estudiante la ve
 * clara u oscura, como tenga la app. Se guarda como 'blanco' (el valor que
 * ya aceptaba la base), así no hace falta cambiar la base de datos.
 */
export const COLOR_TEMA = 'blanco';

/** Colores fijos (no cambian con el tema): fondo y color del texto. */
export const PALETA_VENTANA: Record<string, { fondo: string; texto: string; nombre: string }> = {
  celeste: { fondo: '#1879B4', texto: '#FFFFFF', nombre: 'Celeste' },
  marino: { fondo: '#0E4A73', texto: '#FFFFFF', nombre: 'Marino' },
  rojo: { fondo: '#B23A3A', texto: '#FFFFFF', nombre: 'Rojo' },
  amarillo: { fondo: '#F4C542', texto: '#1F2A33', nombre: 'Amarillo' },
  gris: { fondo: '#4A5866', texto: '#FFFFFF', nombre: 'Gris' },
};

/** Colores de la ventana "según el tema" en cada modo (los mismos de las tarjetas de la app). */
export const TEMA_VENTANA = {
  claro: { fondo: '#FFFFFF', texto: '#17233A', suave: '#55657E', boton: '#1B4B9B', textoBoton: '#FFFFFF', burbuja: '#DCE8F8', icono: '#1B4B9B', velo: 'rgba(15, 35, 70, 0.45)' },
  oscuro: { fondo: '#16223A', texto: '#E4EAF3', suave: '#A3B0C6', boton: '#24519E', textoBoton: '#FFFFFF', burbuja: '#1A2D52', icono: '#9DBFF2', velo: 'rgba(0, 0, 0, 0.6)' },
} as const;

export type ColoresDeVentana = { fondo: string; texto: string; suave: string; boton: string; textoBoton: string; burbuja: string; icono: string; velo: string };

export const esColorPropio = (c: string) => /^#[0-9A-Fa-f]{6}$/.test(c);
export const esColorTema = (c: string) => c === COLOR_TEMA;
/** ¿Es un valor de color que la base acepta? */
export const colorValido = (c: string) => esColorTema(c) || esColorPropio(c) || Boolean(PALETA_VENTANA[c]);

/** Luminancia relativa (WCAG) de un #RRGGBB. */
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Con un color de fondo y su texto: el botón va del color del texto, el texto del botón del color del fondo. */
function deColorFijo(fondo: string, texto: string, oscuro: boolean): ColoresDeVentana {
  const textoClaro = texto === '#FFFFFF';
  return {
    fondo, texto, suave: texto, boton: texto, textoBoton: fondo, icono: texto,
    burbuja: textoClaro ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
    velo: TEMA_VENTANA[oscuro ? 'oscuro' : 'claro'].velo,
  };
}

/**
 * Colores de una ventana. "Según el tema" sigue el modo claro u oscuro de
 * quien la ve; con un color propio, el texto es blanco o casi negro según contraste.
 */
export function coloresVentana(color: ColorVentana, oscuro = false): ColoresDeVentana {
  if (esColorTema(color)) return { ...TEMA_VENTANA[oscuro ? 'oscuro' : 'claro'] };
  const p = PALETA_VENTANA[color];
  if (p) return deColorFijo(p.fondo, p.texto, oscuro);
  if (esColorPropio(color)) {
    const l = luminancia(color);
    // Contraste contra blanco (1.05/(l+0.05)) vs. contra #1F2A33 (l≈0.022).
    const blanco = 1.05 / (l + 0.05);
    const negro = (l + 0.05) / (0.022 + 0.05);
    return deColorFijo(color, blanco >= negro ? '#FFFFFF' : '#1F2A33', oscuro);
  }
  return { ...TEMA_VENTANA[oscuro ? 'oscuro' : 'claro'] };
}

/** Cuándo vio cada ventana este usuario: id → { version (updated_at), dia (AAAA-MM-DD) }. */
export type Vistas = Record<string, { version: string; dia: string }>;

export const diaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ¿Toca mostrarla según cada cuánto? `enEstaSesion`: ya se mostró desde que se abrió la app. */
export function tocaMostrar(v: Pick<VentanaDb, 'id' | 'updated_at' | 'frecuencia'>, vistas: Vistas, ahora: Date, enEstaSesion: Set<string>): boolean {
  if (enEstaSesion.has(v.id)) return false;
  const vista = vistas[v.id];
  // Si el CEQ la editó, se vuelve a mostrar.
  if (!vista || vista.version !== v.updated_at) return true;
  const f: FrecuenciaVentana = v.frecuencia;
  if (f === 'siempre') return true;
  if (f === 'diaria') return vista.dia !== diaLocal(ahora);
  return false;
}

export function vigente(v: Pick<VentanaDb, 'activa' | 'desde' | 'hasta'>, ahora: Date): boolean {
  return v.activa && new Date(v.desde) <= ahora && (!v.hasta || new Date(v.hasta) > ahora);
}

/**
 * La ventana que hay que mostrar ahora (o null): la de mayor prioridad y,
 * a igual prioridad, la más nueva. `enInicio`: el estudiante está en Inicio.
 */
export function elegirVentana(lista: VentanaDb[], vistas: Vistas, ahora: Date, enEstaSesion: Set<string>, enInicio: boolean, carreraId?: string | null): VentanaDb | null {
  const candidatas = lista
    .filter((v) => vigente(v, ahora))
    .filter((v) => !v.carrera_id || v.carrera_id === carreraId)
    .filter((v) => v.donde === 'todas' || enInicio)
    .filter((v) => tocaMostrar(v, vistas, ahora, enEstaSesion))
    .sort((a, b) => b.prioridad - a.prioridad || b.desde.localeCompare(a.desde));
  return candidatas[0] ?? null;
}

export function marcarVista(vistas: Vistas, v: Pick<VentanaDb, 'id' | 'updated_at'>, ahora: Date): Vistas {
  return { ...vistas, [v.id]: { version: v.updated_at, dia: diaLocal(ahora) } };
}

/** Destino del botón: pantalla de la app ("/calendario") o página web (https://). */
export function destinoValido(d: string): boolean {
  return /^\/[A-Za-z0-9/_-]*$/.test(d) || /^https:\/\/\S+$/.test(d);
}

export const LIMITE_TITULO_VENTANA = 80;
export const LIMITE_CUERPO_VENTANA = 600;
export const LIMITE_BOTON_VENTANA = 30;

/**
 * Tiempo (ms) desde que aparece la ventana en el que no se hace caso a los
 * toques afuera: la ventana sale a los segundos y quien está deslizando la
 * cerraría sin querer.
 */
export const ESPERA_TOQUE_AFUERA_MS = 1000;

/**
 * ¿Tocar afuera (o el botón Atrás de Android) cierra la ventana? La cruz
 * siempre está; `cerrable` es "también tocando afuera". La de pantalla
 * completa no tiene afuera.
 */
export function cierraTocandoAfuera(v: { cerrable: boolean; forma: string }, msDesdeQueAparecio: number): boolean {
  return v.cerrable && v.forma !== 'pantalla' && msDesdeQueAparecio >= ESPERA_TOQUE_AFUERA_MS;
}

export interface FormularioVentana {
  titulo: string;
  cuerpo: string;
  imagen_url: string;
  icono: string;
  boton_texto: string;
  boton_destino: string;
  color: string;
  cerrable: boolean;
}

/** Error para mostrar, o null si se puede guardar. */
export function validarVentana(f: FormularioVentana): string | null {
  if (!f.titulo.trim()) return 'Poné un título.';
  if (f.titulo.trim().length > LIMITE_TITULO_VENTANA) return `El título puede tener hasta ${LIMITE_TITULO_VENTANA} letras.`;
  if (f.cuerpo.length > LIMITE_CUERPO_VENTANA) return `El texto puede tener hasta ${LIMITE_CUERPO_VENTANA} letras.`;
  if (f.imagen_url.trim() && !/^https:\/\/\S+$/.test(f.imagen_url.trim())) return 'La imagen tiene que ser un enlace que empiece con https://';
  if (f.icono.trim() && !/^[a-z0-9-]{1,40}$/.test(f.icono.trim())) return 'Ese ícono no existe.';
  const bt = f.boton_texto.trim();
  const bd = f.boton_destino.trim();
  if (bt && !bd) return 'Elegí a dónde lleva el botón.';
  if (bd && !bt) return 'Escribí el texto del botón.';
  if (bt.length > LIMITE_BOTON_VENTANA) return `El botón puede tener hasta ${LIMITE_BOTON_VENTANA} letras.`;
  if (bd && !destinoValido(bd)) return 'El botón tiene que llevar a una pantalla de la app o a un enlace https://';
  if (!colorValido(f.color)) return 'El color tiene que ser de la lista o un código como #1879B4.';
  return null;
}
