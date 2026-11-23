/**
 * Ventanas flotantes que arma el CEQ desde el panel: cuál mostrar, cuándo
 * y con qué colores. Sin React ni Supabase, para poder probarlo.
 */
import type { ColorVentana, FrecuenciaVentana, VentanaDb } from './tipos-db';

/** Paleta fija (no cambia con el tema): fondo y color del texto. */
export const PALETA_VENTANA: Record<string, { fondo: string; texto: string; nombre: string }> = {
  celeste: { fondo: '#1879B4', texto: '#FFFFFF', nombre: 'Celeste' },
  marino: { fondo: '#0E4A73', texto: '#FFFFFF', nombre: 'Marino' },
  rojo: { fondo: '#B23A3A', texto: '#FFFFFF', nombre: 'Rojo' },
  amarillo: { fondo: '#F4C542', texto: '#1F2A33', nombre: 'Amarillo' },
  gris: { fondo: '#4A5866', texto: '#FFFFFF', nombre: 'Gris' },
  blanco: { fondo: '#FFFFFF', texto: '#0F5F94', nombre: 'Blanco' },
};

export const esColorPropio = (c: string) => /^#[0-9A-Fa-f]{6}$/.test(c);

/** Luminancia relativa (WCAG) de un #RRGGBB. */
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Fondo y texto de una ventana. Con un color propio, el texto es blanco o casi negro según contraste. */
export function coloresVentana(color: ColorVentana): { fondo: string; texto: string } {
  const p = PALETA_VENTANA[color];
  if (p) return { fondo: p.fondo, texto: p.texto };
  if (esColorPropio(color)) {
    const l = luminancia(color);
    // Contraste contra blanco (1.05/(l+0.05)) vs. contra #1F2A33 (l≈0.022).
    const blanco = 1.05 / (l + 0.05);
    const oscuro = (l + 0.05) / (0.022 + 0.05);
    return { fondo: color, texto: blanco >= oscuro ? '#FFFFFF' : '#1F2A33' };
  }
  return { fondo: PALETA_VENTANA.celeste.fondo, texto: PALETA_VENTANA.celeste.texto };
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
  if (!f.cerrable && !bt) return 'Si no se puede cerrar, poné un botón: es la única forma de salir.';
  if (!PALETA_VENTANA[f.color] && !esColorPropio(f.color)) return 'El color tiene que ser de la lista o un código como #1879B4.';
  return null;
}
