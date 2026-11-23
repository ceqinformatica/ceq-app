/**
 * Reglas del carnet de socio del CEQ, sin dependencias de React ni de
 * Supabase para poder probarlas con node --test.
 *
 * El carnet tiene costo: solo lo tiene quien pagó y el CEQ dio de alta.
 * El QR lleva "CEQ1:" + un código al azar (sin nombre ni C.I.); quien
 * verifica lo consulta en la base con verificar_carnet().
 */

export const PREFIJO_QR = 'CEQ1:';

export const AVISO_CARNET_PAGO =
  'El carnet de socio del CEQ (físico y virtual) tiene un costo y dura 3 años (6 semestres). Si ya tenés el carnet físico, sacale una foto acá y el CEQ te habilita el digital.';

/** El carnet dura 3 años (6 semestres). */
export const ANIOS_VIGENCIA = 3;

/** Suma años a una fecha AAAA-MM-DD (el 29/02 pasa al 28/02). */
export function sumarAnios(iso: string, anios: number) {
  const [a, m, d] = iso.split('-').map(Number);
  const dia = m === 2 && d === 29 ? 28 : d;
  return `${a + anios}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** "25/11/2026" → "2026-11-25", o null. */
export function isoDeTexto(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Revisa el vencimiento que el estudiante leyó en su carnet físico.
 * Devuelve el problema, o null si se puede enviar.
 */
export function problemaVencimiento(vence: string | null, ahora = new Date()): string | null {
  if (!vence) return 'Elegí la fecha de vencimiento que figura en tu carnet.';
  const hoy = hoyPy(ahora);
  if (vence < hoy) return 'Tu carnet está vencido. Renovalo en la sede del CEQ para tener el carnet digital.';
  // Igual que la base: hasta 3 años y 1 mes desde hoy.
  const [y, m, d] = sumarAnios(hoy, ANIOS_VIGENCIA).split('-').map(Number);
  const limite = new Date(Date.UTC(y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()))).toISOString().slice(0, 10);
  if (vence > limite) return 'Esa fecha no es posible: el carnet dura 3 años.';
  return null;
}

export type EstadoCarnet = 'vigente' | 'vencido' | 'inactivo';

/** Lo que va dentro del QR. */
export function contenidoQr(codigo: string) {
  return `${PREFIJO_QR}${codigo}`;
}

/** Normaliza lo que leyó la cámara o escribió quien verifica. */
export function leerQr(texto: string): string {
  const t = texto.trim();
  return t.toUpperCase().startsWith(PREFIJO_QR) ? t.slice(PREFIJO_QR.length).trim() : t;
}

/** La cédula sin puntos, guiones ni espacios, igual que en la base. */
export function normalizarCi(ci: string) {
  return ci.replace(/[^0-9A-Za-z]/g, '');
}

/** "4.555.666" para mostrar. */
export function formatearCi(ci: string) {
  const n = normalizarCi(ci);
  return /^\d+$/.test(n) ? n.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : n;
}

/** Fecha de hoy en Paraguay como AAAA-MM-DD. */
export function hoyPy(ahora = new Date()) {
  const py = new Date(ahora.getTime() - 3 * 3600 * 1000); // UTC-3 todo el año desde 2024
  return py.toISOString().slice(0, 10);
}

export function estadoCarnet(socio: { activo?: boolean | null; vigente_hasta: string | null }, ahora = new Date()): EstadoCarnet {
  if (socio.activo === false) return 'inactivo';
  if (socio.vigente_hasta && socio.vigente_hasta < hoyPy(ahora)) return 'vencido';
  return 'vigente';
}

/**
 * Opciones de vigencia para el alta, sin teclear fechas: 3 años
 * (6 semestres) desde hoy, o sin vencimiento.
 */
export function opcionesVigencia(ahora = new Date()): { texto: string; valor: string | null }[] {
  const tres = sumarAnios(hoyPy(ahora), ANIOS_VIGENCIA);
  return [
    { texto: `3 años (hasta ${fechaCorta(tres)})`, valor: tres },
    { texto: 'Sin vencimiento', valor: null },
  ];
}

export function fechaCorta(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export interface FormularioSocio {
  nombre: string;
  ci: string;
  numero_socio: string;
  vigente_hasta: string | null;
  usuario_id: string | null;
  pagado_en: string | null;
  observacion: string;
  activo: boolean;
}

/** Devuelve el primer problema del formulario, o null si está bien. */
export function validarSocio(f: FormularioSocio): string | null {
  if (f.nombre.trim().length < 3) return 'Escribí el nombre completo del socio.';
  const ci = normalizarCi(f.ci);
  if (ci.length < 4 || ci.length > 12) return 'La cédula tiene que tener entre 4 y 12 caracteres.';
  if (f.numero_socio.trim().length > 20) return 'El número de socio es muy largo.';
  return null;
}

/** Texto y colores del resultado de una verificación. */
export const RESULTADO_VERIFICACION = {
  vigente: { titulo: 'Carnet válido', detalle: 'Socio del CEQ al día.', icono: 'checkmark-circle', color: '#1D7A47', fondo: '#E3F4EA' },
  vencido: { titulo: 'Carnet vencido', detalle: 'Fue socio, pero no renovó la cuota.', icono: 'time', color: '#A86A00', fondo: '#FFF3D6' },
  inactivo: { titulo: 'Carnet dado de baja', detalle: 'El CEQ deshabilitó este carnet.', icono: 'close-circle', color: '#B2392F', fondo: '#FBE3E1' },
  no_encontrado: { titulo: 'No es un carnet del CEQ', detalle: 'El código no existe o ya fue renovado.', icono: 'alert-circle', color: '#B2392F', fondo: '#FBE3E1' },
} as const;
