/**
 * Fechas y horas para programar avisos y notificaciones desde el panel
 * del CEQ. Funciones puras: la hora es la del celular (Paraguay).
 */

export const LIMITE_TITULO = 120;
export const LIMITE_CUERPO = 500;
/** Más largo que esto se corta en la pantalla bloqueada de muchos celulares. */
export const TITULO_RECOMENDADO = 65;

const dos = (n: number) => String(n).padStart(2, '0');
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export type Resultado = { fecha: Date } | { error: string };

/**
 * Lee "25/11/2026" o "25/11" (año actual, o el próximo si ya pasó) y
 * "18:30" o "18". Devuelve error si falta algo, no existe o ya pasó.
 */
export function leerFechaHora(fechaTxt: string, horaTxt: string, ahora = new Date()): Resultado {
  const f = fechaTxt.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (!f) return { error: 'Escribí la fecha como DD/MM/AAAA, por ejemplo 25/11/2026.' };
  const h = horaTxt.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hs)?$/i);
  if (!h) return { error: 'Escribí la hora como HH:MM, por ejemplo 18:30.' };
  const dia = Number(f[1]);
  const mes = Number(f[2]);
  const hora = Number(h[1]);
  const minuto = Number(h[2] ?? 0);
  if (hora > 23 || minuto > 59) return { error: 'Esa hora no existe.' };
  const conAnio = f[3] != null;
  let anio = conAnio ? Number(f[3]) : ahora.getFullYear();
  if (anio < 100) anio += 2000;
  const armar = (a: number) => new Date(a, mes - 1, dia, hora, minuto, 0, 0);
  let fecha = armar(anio);
  if (fecha.getDate() !== dia || fecha.getMonth() !== mes - 1) return { error: 'Esa fecha no existe.' };
  if (!conAnio && fecha.getTime() < ahora.getTime() - 60_000) fecha = armar(anio + 1);
  if (fecha.getTime() < ahora.getTime() - 60_000) return { error: 'Esa fecha ya pasó.' };
  if (fecha.getTime() > ahora.getTime() + 366 * 86_400_000) return { error: 'Se puede programar hasta un año adelante.' };
  return { fecha };
}

/** Atajos para no tener que escribir la fecha. */
export function atajos(ahora = new Date()): { texto: string; fecha: Date }[] {
  const lista: { texto: string; fecha: Date }[] = [];
  const enUnaHora = new Date(ahora.getTime() + 3_600_000);
  enUnaHora.setSeconds(0, 0);
  lista.push({ texto: 'En 1 hora', fecha: enUnaHora });
  const hoy18 = new Date(ahora);
  hoy18.setHours(18, 0, 0, 0);
  if (hoy18.getTime() - ahora.getTime() > 30 * 60_000) lista.push({ texto: 'Hoy 18:00', fecha: hoy18 });
  for (const h of [8, 18]) {
    const m = new Date(ahora);
    m.setDate(m.getDate() + 1);
    m.setHours(h, 0, 0, 0);
    lista.push({ texto: `Mañana ${dos(h)}:00`, fecha: m });
  }
  return lista;
}

const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Hoy 18:00", "Mañana 08:00", "lun 24/11 08:00" o "24/11/2027 08:00". */
export function describirCuando(iso: string | Date, ahora = new Date()): string {
  const f = typeof iso === 'string' ? new Date(iso) : iso;
  const hora = `${dos(f.getHours())}:${dos(f.getMinutes())}`;
  if (mismoDia(f, ahora)) return `Hoy ${hora}`;
  const manana = new Date(ahora);
  manana.setDate(manana.getDate() + 1);
  if (mismoDia(f, manana)) return `Mañana ${hora}`;
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(f, ayer)) return `Ayer ${hora}`;
  if (f.getFullYear() === ahora.getFullYear()) return `${DIAS[f.getDay()]} ${f.getDate()}/${f.getMonth() + 1} ${hora}`;
  return `${f.getDate()}/${f.getMonth() + 1}/${f.getFullYear()} ${hora}`;
}

/** Para rellenar los campos al editar algo ya programado. */
export function partesDe(fecha: Date): { fecha: string; hora: string } {
  return { fecha: `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()}`, hora: `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}` };
}

/** Errores de título y texto antes de guardar (null si está bien). */
export function validarMensaje(titulo: string, cuerpo: string, { cuerpoObligatorio = true } = {}): string | null {
  const t = titulo.trim();
  const c = cuerpo.trim();
  if (!t) return 'Falta el título.';
  if (t.length > LIMITE_TITULO) return `El título puede tener hasta ${LIMITE_TITULO} letras.`;
  if (cuerpoObligatorio && !c) return 'Falta el texto.';
  if (c.length > LIMITE_CUERPO && cuerpoObligatorio) return `El texto de la notificación puede tener hasta ${LIMITE_CUERPO} letras.`;
  return null;
}

/** Solo rutas internas de la app (la notificación abre esa pantalla). */
export function rutaSegura(ruta: unknown): string | null {
  return typeof ruta === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(ruta) && !ruta.startsWith('//') ? ruta : null;
}
