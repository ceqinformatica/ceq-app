/**
 * Lee el calendario académico que publica la FCQ (PDF con texto o
 * escaneado, ya pasado a texto) y arma la lista de fechas para revisar.
 *
 * Cada renglón con una fecha es una actividad: lo que no es fecha es el
 * título. Reconoce:
 * - "22 de febrero de 2027", "23/03/2027", "lunes 1 de marzo";
 * - rangos: "Del 16 de febrero al 16 de marzo de 2027", "15 al 27 de junio",
 *   "10/06/2027 al 25/06/2027", "02/08/2027 – 13/11/2027";
 * - plazos: "Hasta el 30 de abril" (un solo día);
 * - un título en un renglón y su fecha en el siguiente.
 * La categoría y el semestre se deducen del título; el admin los corrige.
 */
import { CATEGORIAS_CALENDARIO, type CategoriaCalendario } from './calendario.ts';
import { normalizar, valida } from './horario-finales.ts';

export interface EventoLeido {
  titulo: string;
  categoria: CategoriaCalendario;
  semestre: 1 | 2 | null;
  anio: number;
  /** AAAA-MM-DD */
  desde: string;
  hasta: string;
  /** Renglón del PDF de donde salió. */
  origen: string;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
};
const NOMBRES_MES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic';

const DIAS_SEMANA = '(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)';

interface Pieza {
  d: number;
  m: number | null;
  a: number | null;
  desde: number;
  hasta: number;
}

const dos = (n: number) => String(n).padStart(2, '0');

/** Fechas (completas o partes) de un renglón normalizado, en orden. */
function piezas(n: string): Pieza[] {
  const out: Pieza[] = [];
  const ocupado: [number, number][] = [];
  const libre = (a: number, b: number) => !ocupado.some(([x, y]) => a < y && b > x);
  const numericas = /(?:^|[^\d:/.])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?![\d:])/g;
  for (const m of n.matchAll(numericas)) {
    const desde = (m.index ?? 0) + m[0].indexOf(m[1]);
    const hasta = (m.index ?? 0) + m[0].length;
    let a = m[3] ? Number(m[3]) : null;
    if (a != null && a < 100) a += 2000;
    out.push({ d: Number(m[1]), m: Number(m[2]), a, desde, hasta });
    ocupado.push([desde, hasta]);
  }
  // "16 de febrero (de 2027)", y el "15" de "15 al 27 de junio".
  const largas = new RegExp(`\\b(\\d{1,2})(?:\\s+de)?\\s+(${NOMBRES_MES})\\b(?:\\s+(?:de|del)?\\s*(20\\d\\d))?|\\b(\\d{1,2})(?=\\s*(?:al|a|y|-|–)\\s+(?:el\\s+)?(?:${DIAS_SEMANA}\\s+)?\\d{1,2}\\b)`, 'g');
  for (const m of n.matchAll(largas)) {
    const desde = m.index ?? 0;
    const hasta = desde + m[0].length;
    if (!libre(desde, hasta)) continue;
    if (m[4]) out.push({ d: Number(m[4]), m: null, a: null, desde, hasta });
    else out.push({ d: Number(m[1]), m: MESES[m[2]], a: m[3] ? Number(m[3]) : null, desde, hasta });
    ocupado.push([desde, hasta]);
  }
  return out.sort((a, b) => a.desde - b.desde);
}

/** Lo que hay entre dos fechas para que sean un rango: "al", "a", "-", "hasta el"… */
const UNION_RANGO = new RegExp(`^\\s*(?:al|a|-|–|—|hasta(?: el)?|y el|\\s)\\s*(?:el\\s+)?(?:${DIAS_SEMANA}\\s*)?$`);

/** Año del documento: "CALENDARIO ACADÉMICO 2027" o el más repetido. */
function anioDelDocumento(texto: string, ref: Date): number {
  const n = normalizar(texto.slice(0, 3000));
  const t = /calendario(?: academico)?(?: del?)?(?: ano)?\s*(20\d\d)/.exec(n);
  if (t) return Number(t[1]);
  const cuenta = new Map<number, number>();
  for (const m of normalizar(texto).matchAll(/\b(20[2-4]\d)\b/g)) cuenta.set(Number(m[1]), (cuenta.get(Number(m[1])) ?? 0) + 1);
  const mas = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
  return mas ? mas[0] : ref.getFullYear();
}

/** Categoría según las palabras del título. */
export function categoriaDe(titulo: string): CategoriaCalendario {
  const n = normalizar(titulo);
  if (/\bferiado\b/.test(n)) return 'feriado';
  if (/\b(asueto|receso|vacaciones|semana santa)\b/.test(n)) return 'asueto';
  if (/\b(ingresantes?|admision|curso probatorio|cpi)\b/.test(n)) return 'ingresantes';
  if (/\bhorarios? de (examenes )?finales\b|\banteproyecto\b/.test(n)) return 'horarios';
  if (/\b(arancel(es)?|cuotas?|pago|matricula anual)\b/.test(n)) return 'aranceles';
  if (/\b(examen(es)?|finales?|parciales?|evaluacion(es)?|mesas?)\b/.test(n)) return 'examenes';
  if (/\b(inscripcion(es)?|matriculacion|reinscripcion)\b/.test(n)) return 'inscripcion';
  if (/\b(clases?|semestre|dictado|inicio|fin|cierre de actas)\b/.test(n)) return 'clases';
  return 'solicitudes';
}

function semestreDe(titulo: string, categoria: CategoriaCalendario, desde: string): 1 | 2 | null {
  if (categoria === 'feriado' || categoria === 'ingresantes') return null;
  const n = normalizar(titulo);
  if (/\b(primer|1\s*er|1)\s*(semestre|periodo academico)\b/.test(n)) return 1;
  if (/\b(segundo|2\s*do|2)\s*(semestre|periodo academico)\b/.test(n)) return 2;
  const mes = Number(desde.slice(5, 7));
  return mes >= 2 && mes <= 7 ? 1 : 2;
}

/** Título limpio: sin fechas, sin "del", "hasta el" ni signos sueltos en los bordes. */
function limpiarTitulo(crudo: string): string {
  let t = crudo
    .replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, ' ')
    .replace(new RegExp(`\\b(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),?\\s+)?\\d{1,2}(?:\\s+de)?\\s+(?:${NOMBRES_MES})\\b(?:\\s+(?:de|del)?\\s*20\\d\\d)?`, 'gi'), ' ')
    .replace(/\b(?:del?|al|hasta el|hasta|desde el|desde|a partir del?|el|y)\s*(?=\s{2,}|$)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Restos al final ("Del", "al", "-") y signos en los bordes.
  for (let i = 0; i < 4; i++) t = t.replace(/(?:^[\s:;,.–—-]+|[\s:;,–—-]+$|\s+(?:del?|al|a|hasta(?: el)?|desde(?: el)?|el|y|\d{1,2}|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)$)/i, '').trim();
  // "1.*" o "1.?": así lee el OCR la a voladita de "1.ª".
  t = t.replace(/\b(\d)\s?\.\s?[*?°º]\s/g, '$1.ª ');
  if (t) t = t[0].toUpperCase() + t.slice(1);
  return t.slice(0, 160);
}

function iso(p: Pieza): string | null {
  if (p.m == null || p.a == null || !valida(p.a, p.m, p.d)) return null;
  return `${p.a}-${dos(p.m)}-${dos(p.d)}`;
}

/** Encabezados y firmas que nunca son actividades. */
const DESCARTAR = /^(universidad|facultad|direccion|secretaria|calendario academico|actividad|fecha|aprobado|resolucion|prof\b|dra?\b|lic\b|coordinador|decan|director)/;

export function leerCalendarioPdf(texto: string, referencia = new Date()): { eventos: EventoLeido[]; sinUsar: string[] } {
  const anioDoc = anioDelDocumento(texto, referencia);
  const eventos: EventoLeido[] = [];
  const sinUsar: string[] = [];
  let tituloPendiente = '';

  for (const renglon of texto.split('\n')) {
    const crudo = renglon.replace(/\s+$/, '');
    if (!crudo.trim()) {
      tituloPendiente = '';
      continue;
    }
    const n = normalizar(crudo.replace(/\s{3,}/g, ' | '));
    const ps = piezas(n);
    if (!ps.length) {
      // Un título sin fecha: su fecha puede venir en el renglón siguiente.
      tituloPendiente = DESCARTAR.test(n) ? '' : limpiarTitulo(crudo);
      continue;
    }
    // Completa mes y año hacia atrás ("15 al 27 de junio de 2027").
    for (let i = ps.length - 1; i >= 0; i--) {
      const sig = ps[i + 1];
      if (ps[i].m == null) ps[i].m = sig?.m ?? null;
      if (ps[i].a == null) ps[i].a = sig && sig.m != null && ps[i].m != null && ps[i].m! <= sig.m ? sig.a : null;
    }
    for (const p of ps) if (p.a == null && p.m != null) p.a = anioDoc;
    // Rangos: dos fechas unidas por "al", "-", "hasta"; o dos fechas en la misma celda.
    const usados = new Set<number>();
    const pares: [Pieza, Pieza][] = [];
    for (let i = 0; i < ps.length; i++) {
      if (usados.has(i)) continue;
      const a = ps[i];
      const b = ps[i + 1];
      const entre = b ? n.slice(a.hasta, b.desde) : '';
      if (b && (UNION_RANGO.test(entre) || /^\s*\|?\s*$/.test(entre)) && iso(a) && iso(b) && iso(a)! <= iso(b)!) {
        pares.push([a, b]);
        usados.add(i + 1);
      } else {
        pares.push([a, a]);
      }
    }
    let titulo = limpiarTitulo(crudo);
    if (titulo.length < 3 || DESCARTAR.test(normalizar(titulo))) titulo = tituloPendiente;
    tituloPendiente = '';
    let alguno = false;
    for (const [a, b] of pares) {
      const desde = iso(a);
      const hasta = iso(b);
      if (!desde || !hasta) continue;
      if (titulo.length < 3) {
        sinUsar.push(crudo.trim());
        continue;
      }
      const categoria = categoriaDe(titulo);
      eventos.push({ titulo, categoria, semestre: semestreDe(titulo, categoria, desde), anio: Number(desde.slice(0, 4)), desde, hasta, origen: crudo.trim() });
      alguno = true;
    }
    if (!alguno && !DESCARTAR.test(n)) sinUsar.push(crudo.trim());
  }

  const vistos = new Set<string>();
  return {
    eventos: eventos.filter((e) => {
      const k = `${normalizar(e.titulo)}|${e.desde}|${e.hasta}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    }),
    sinUsar,
  };
}

/** Para el selector de la pantalla de revisión. */
export const CATEGORIAS_EDITABLES = CATEGORIAS_CALENDARIO;
