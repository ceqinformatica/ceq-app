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
  'El carnet de socio del CEQ (físico y virtual) tiene un costo. Si ya tenés el carnet físico, sacale una foto acá: la app lee el vencimiento y el CEQ te habilita el digital.';

/** Duración habitual de un carnet nuevo (3 años, 6 semestres): la que ofrece el alta. */
export const ANIOS_VIGENCIA = 3;

/**
 * Hay varios diseños de carnet vigentes con duraciones distintas: vale el
 * vencimiento impreso en cada uno. Solo se descarta lo imposible (más de
 * 6 años desde hoy), igual que en la base.
 */
export const ANIOS_MAXIMO_CARNET = 6;

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
  if (!vence) return 'Elegí el vencimiento que figura en tu carnet.';
  const hoy = hoyPy(ahora);
  if (vence < hoy) return 'Tu carnet está vencido. Renovalo en la sede del CEQ para tener el carnet digital.';
  // Igual que la base: hasta 6 años desde hoy.
  if (vence > sumarAnios(hoy, ANIOS_MAXIMO_CARNET)) return 'Ese vencimiento no parece correcto. Revisá la fecha que figura en tu carnet.';
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
 * El carnet vence por semestre, no en una fecha exacta: "1.er semestre 2027",
 * "2.º semestre 2028". En la base se guarda como el último día del semestre
 * (31/07 para el 1.º y 31/12 para el 2.º), así las reglas de vencido y
 * vigente siguen funcionando con fechas.
 */
export type Semestre = { semestre: 1 | 2; anio: number };

/** Último día del semestre, como AAAA-MM-DD. */
export function finDeSemestre({ semestre, anio }: Semestre) {
  return `${anio}-${semestre === 1 ? '07-31' : '12-31'}`;
}

/** Semestre al que pertenece una fecha (enero a julio = 1.º). */
export function semestreDe(iso: string): Semestre {
  const [a, m] = iso.slice(0, 10).split('-').map(Number);
  return { semestre: m <= 7 ? 1 : 2, anio: a };
}

/** "1.er semestre 2027". */
export function textoSemestre(iso: string) {
  const { semestre, anio } = semestreDe(iso);
  return `${semestre === 1 ? '1.er' : '2.º'} semestre ${anio}`;
}

/** Suma semestres: 2.º 2026 + 1 = 1.º 2027. */
export function sumarSemestres({ semestre, anio }: Semestre, n: number): Semestre {
  const indice = anio * 2 + (semestre - 1) + n;
  return { semestre: ((indice % 2) + 1) as 1 | 2, anio: Math.floor(indice / 2) };
}

/** Semestres que dura el carnet. */
export const SEMESTRES_VIGENCIA = ANIOS_VIGENCIA * 2;

/**
 * Semestres para elegir rápido el vencimiento: el actual y los 6
 * siguientes. Para otra fecha está el selector de fecha.
 */
export function opcionesSemestre(ahora = new Date()): { texto: string; valor: string }[] {
  const actual = semestreDe(hoyPy(ahora));
  const r: { texto: string; valor: string }[] = [];
  for (let i = 0; i <= SEMESTRES_VIGENCIA; i++) {
    const valor = finDeSemestre(sumarSemestres(actual, i));
    if (problemaVencimiento(valor, ahora)) continue;
    r.push({ texto: textoSemestre(valor), valor });
  }
  return r;
}

/**
 * Opciones de vigencia para el alta, sin teclear fechas: 6 semestres
 * contando el actual, o sin vencimiento.
 */
export function opcionesVigencia(ahora = new Date()): { texto: string; valor: string | null }[] {
  const fin = finDeSemestre(sumarSemestres(semestreDe(hoyPy(ahora)), SEMESTRES_VIGENCIA - 1));
  return [
    { texto: `6 semestres (hasta el ${textoSemestre(fin)})`, valor: fin },
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
  return null;
}

/** Texto y colores del resultado de una verificación. */
export const RESULTADO_VERIFICACION = {
  vigente: { titulo: 'Carnet válido', detalle: 'Socio del CEQ al día.', icono: 'checkmark-circle', color: '#1677B0', fondo: '#E1F2FC' },
  vencido: { titulo: 'Carnet vencido', detalle: 'Fue socio, pero no renovó la cuota.', icono: 'time', color: '#3F5168', fondo: '#E9EEF4' },
  inactivo: { titulo: 'Carnet dado de baja', detalle: 'El CEQ deshabilitó este carnet.', icono: 'close-circle', color: '#B2392F', fondo: '#FBE3E1' },
  no_encontrado: { titulo: 'No es un carnet del CEQ', detalle: 'El código no existe o ya fue renovado.', icono: 'alert-circle', color: '#B2392F', fondo: '#FBE3E1' },
} as const;
