/**
 * Estadísticas de la carrera: promedio, avance, cuánto falta, notas por
 * nivel y evolución por semestre. Funciones puras, sobre los mismos datos
 * que ya carga "Mi carrera" (malla, estados e intentos de final).
 */
import { notaAprobada, promedios, type IntentoFinal } from './finales.ts';
import { calcularProgreso, esSeminario, type EstadoEstudiante, type GrupoOptativas, type Materia, type Progreso, type UnidadAvance } from './progreso.ts';

export interface DatosNivel {
  nivel: number;
  aprobadas: number;
  total: number;
  /** Promedio de las aprobadas con nota en ese nivel. */
  promedio: number | null;
}

export interface DatosPeriodo {
  /** "2026-1" o "2026-2". */
  periodo: string;
  etiqueta: string;
  /** Finales aprobados en ese periodo. */
  aprobados: number;
  aplazos: number;
  /** Promedio de los finales aprobados en ese periodo. */
  promedio: number | null;
  /** Promedio general acumulado hasta ese periodo (solo finales aprobados). */
  acumulado: number | null;
}

export interface Estadisticas {
  progreso: Progreso;
  promedio: number | null;
  promedioConAplazos: number | null;
  aplazos: number;
  /** Promedio ponderado por créditos u horas, si el plan mide así el avance. */
  promedioPonderado: number | null;
  /** Promedio de firma (0 a 100) de las materias con firma guardada. */
  promedioFirma: number | null;
  aprobadas: number;
  firmadas: number;
  cursando: number;
  /** Materias que exige el plan: obligatorias + optativas exigidas. */
  exigidas: number;
  /** Materias que faltan aprobar (obligatorias + optativas que faltan). */
  faltan: number;
  /** Niveles de la malla con alguna obligatoria sin aprobar. */
  nivelesPendientes: number[];
  /** Cuántas materias de cada nota (2 a 5) aprobó. */
  distribucion: { nota: number; cantidad: number }[];
  porNivel: DatosNivel[];
  porPeriodo: DatosPeriodo[];
  finalesRendidos: number;
  finalesAprobados: number;
  /** % de finales rendidos que aprobó, o null si no rindió ninguno. */
  efectividad: number | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;
const promedio = (xs: number[]) => (xs.length ? redondear(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

/** "2026-1" → "1.er sem. 2026". Cualquier otro texto queda igual. */
export function etiquetaPeriodo(periodo: string): string {
  const m = /^(\d{4})-([12])$/.exec(periodo);
  if (!m) return periodo;
  return `${m[2] === '1' ? '1.er' : '2.º'} sem. ${m[1]}`;
}

/** Nota con la que aprobó cada materia (sin seminarios): la mejor de los finales o la que cargó a mano. */
export function notasAprobadas(
  materias: Materia[],
  estados: Map<string, EstadoEstudiante>,
  intentos: IntentoFinal[],
): Map<string, number> {
  const notas = new Map<string, number>();
  for (const m of materias) {
    if (esSeminario(m.nombre)) continue;
    const e = estados.get(m.id);
    const n = notaAprobada(m.id, intentos) ?? (e?.estado === 'aprobada' ? e.notaFinal ?? null : null);
    if (n != null && n >= 2 && n <= 5) notas.set(m.id, n);
  }
  return notas;
}

export function calcularEstadisticas(
  materias: Materia[],
  grupos: GrupoOptativas[],
  estados: Map<string, EstadoEstudiante>,
  intentos: IntentoFinal[],
  unidad: UnidadAvance = 'materias',
): Estadisticas {
  const progreso = calcularProgreso(materias, grupos, estados, unidad);
  const prom = promedios(materias, estados, intentos);
  const notas = notasAprobadas(materias, estados, intentos);
  const estado = (id: string) => estados.get(id)?.estado ?? 'pendiente';

  // Promedio ponderado por créditos u horas (solo si el plan mide así).
  let promedioPonderado: number | null = null;
  if (unidad !== 'materias') {
    let suma = 0;
    let pesos = 0;
    for (const m of materias) {
      const n = notas.get(m.id);
      const w = (unidad === 'creditos' ? m.creditos : m.horas) ?? 0;
      if (n == null || w <= 0) continue;
      suma += n * w;
      pesos += w;
    }
    promedioPonderado = pesos > 0 ? redondear(suma / pesos) : null;
  }

  const firmas = materias
    .map((m) => estados.get(m.id)?.promedioFirma)
    .filter((f): f is number => f != null && Number.isFinite(f));

  const obligatorias = materias.filter((m) => !m.grupoOptativaId);
  const optExigidas = progreso.optativas.reduce((s, o) => s + o.exigidas, 0);
  const optAprobadas = progreso.optativas.reduce((s, o) => s + Math.min(o.aprobadas, o.exigidas), 0);
  const exigidas = obligatorias.length + optExigidas;
  const aprobadasExigidas = progreso.obligatoriasAprobadas + optAprobadas;

  const nivelesPendientes = [
    ...new Set(obligatorias.filter((m) => estado(m.id) !== 'aprobada').map((m) => m.semestre)),
  ].sort((a, b) => a - b);

  const distribucion = [2, 3, 4, 5].map((nota) => ({
    nota,
    cantidad: [...notas.values()].filter((n) => Math.round(n) === nota).length,
  }));

  const niveles = new Map<number, Materia[]>();
  for (const m of obligatorias) niveles.set(m.semestre, [...(niveles.get(m.semestre) ?? []), m]);
  const porNivel: DatosNivel[] = [...niveles.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([nivel, ms]) => ({
      nivel,
      total: ms.length,
      aprobadas: ms.filter((m) => estado(m.id) === 'aprobada').length,
      promedio: promedio(ms.map((m) => notas.get(m.id)).filter((n): n is number => n != null)),
    }));

  // Evolución por semestre: solo los finales con periodo cargado.
  const delPlan = new Set(materias.filter((m) => !esSeminario(m.nombre)).map((m) => m.id));
  const propios = intentos.filter((i) => delPlan.has(i.materiaId) && (i.tipo ?? 'final') === 'final');
  const periodos = new Map<string, IntentoFinal[]>();
  for (const i of propios) {
    if (!i.periodo) continue;
    periodos.set(i.periodo, [...(periodos.get(i.periodo) ?? []), i]);
  }
  const acumuladas: number[] = [];
  const porPeriodo: DatosPeriodo[] = [...periodos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([periodo, is]) => {
      const ok = is.filter((i) => i.nota >= 2).map((i) => i.nota);
      acumuladas.push(...ok);
      return {
        periodo,
        etiqueta: etiquetaPeriodo(periodo),
        aprobados: ok.length,
        aplazos: is.length - ok.length,
        promedio: promedio(ok),
        acumulado: promedio(acumuladas),
      };
    });

  const finalesAprobados = propios.filter((i) => i.nota >= 2).length;

  return {
    progreso,
    promedio: prom.sinAplazos,
    promedioConAplazos: prom.conAplazos,
    aplazos: prom.aplazos,
    promedioPonderado,
    promedioFirma: firmas.length ? Math.round((firmas.reduce((s, x) => s + x, 0) / firmas.length) * 10) / 10 : null,
    aprobadas: materias.filter((m) => estado(m.id) === 'aprobada').length,
    firmadas: materias.filter((m) => estado(m.id) === 'firmada').length,
    cursando: materias.filter((m) => estado(m.id) === 'cursando').length,
    exigidas,
    faltan: Math.max(0, exigidas - aprobadasExigidas),
    nivelesPendientes,
    distribucion,
    porNivel,
    porPeriodo,
    finalesRendidos: propios.length,
    finalesAprobados,
    efectividad: propios.length ? Math.round((finalesAprobados / propios.length) * 100) : null,
  };
}
