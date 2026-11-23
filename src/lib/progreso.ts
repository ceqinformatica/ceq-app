/**
 * Progreso de carrera, desbloqueo por prerrequisitos y promedio.
 * Funciones puras para poder probarlas con `npm test`.
 */

export type EstadoMateria = 'pendiente' | 'cursando' | 'firmada' | 'aprobada';

/** Los seminarios no llevan nota: se aprueban o no, sin firma ni final. */
export const esSeminario = (nombre: string) => /^\s*seminario/i.test(nombre);

export interface Materia {
  id: string;
  nombre: string;
  semestre: number;
  horas?: number | null;
  creditos?: number | null;
  grupoOptativaId?: string | null;
}

export interface GrupoOptativas {
  id: string;
  nombre: string;
  cantidadExigida: number;
}

export interface Prerrequisito {
  materiaId: string;
  requiereId: string;
  tipo: 'firmada' | 'aprobada';
}

export interface EstadoEstudiante {
  estado: EstadoMateria;
  notaFinal?: number | null;
  /** Promedio con el que firmó (0 a 100), si lo guardó desde la calculadora. */
  promedioFirma?: number | null;
  /** Volvió a cursar la materia y todavía puede deshacerlo. */
  puedeDeshacerRecursada?: boolean;
}

export type UnidadAvance = 'materias' | 'creditos' | 'horas';

const NIVEL: Record<EstadoMateria, number> = { pendiente: 0, cursando: 1, firmada: 2, aprobada: 3 };

/** ¿El estado cumple lo que exige el prerrequisito? Aprobada cumple también "firmada". */
export function cumpleRequisito(estado: EstadoMateria | undefined, exige: 'firmada' | 'aprobada'): boolean {
  return NIVEL[estado ?? 'pendiente'] >= NIVEL[exige];
}

/** Prerrequisitos que le faltan a una materia. Vacío = se puede cursar. */
export function requisitosFaltantes(
  materiaId: string,
  prerrequisitos: Prerrequisito[],
  estados: Map<string, EstadoEstudiante>,
): Prerrequisito[] {
  return prerrequisitos.filter(
    (p) => p.materiaId === materiaId && !cumpleRequisito(estados.get(p.requiereId)?.estado, p.tipo),
  );
}

export function estaDesbloqueada(
  materiaId: string,
  prerrequisitos: Prerrequisito[],
  estados: Map<string, EstadoEstudiante>,
): boolean {
  return requisitosFaltantes(materiaId, prerrequisitos, estados).length === 0;
}

function peso(m: Materia, unidad: UnidadAvance): number {
  if (unidad === 'creditos') return m.creditos ?? 0;
  if (unidad === 'horas') return m.horas ?? 0;
  return 1;
}

export interface Progreso {
  /** 0 a 100. */
  porcentaje: number;
  aprobado: number;
  total: number;
  unidad: UnidadAvance;
  obligatoriasAprobadas: number;
  obligatoriasTotales: number;
  optativas: { grupo: GrupoOptativas; aprobadas: number; exigidas: number }[];
}

/**
 * Avance de carrera: obligatorias aprobadas + optativas aprobadas (hasta lo que
 * exige cada grupo), sobre obligatorias + optativas exigidas.
 * Para optativas medidas en créditos u horas se toma el peso promedio del grupo.
 */
export function calcularProgreso(
  materias: Materia[],
  grupos: GrupoOptativas[],
  estados: Map<string, EstadoEstudiante>,
  unidad: UnidadAvance = 'materias',
): Progreso {
  const aprobada = (m: Materia) => estados.get(m.id)?.estado === 'aprobada';
  const obligatorias = materias.filter((m) => !m.grupoOptativaId);

  let total = 0;
  let hecho = 0;
  for (const m of obligatorias) {
    total += peso(m, unidad);
    if (aprobada(m)) hecho += peso(m, unidad);
  }

  const optativas = grupos.map((g) => {
    const delGrupo = materias.filter((m) => m.grupoOptativaId === g.id);
    const aprobadasG = delGrupo.filter(aprobada);
    const pesoPromedio = delGrupo.length ? delGrupo.reduce((s, m) => s + peso(m, unidad), 0) / delGrupo.length : 0;
    total += g.cantidadExigida * pesoPromedio;
    const contadas = aprobadasG
      .map((m) => peso(m, unidad))
      .sort((a, b) => b - a)
      .slice(0, g.cantidadExigida);
    hecho += contadas.reduce((s, x) => s + x, 0);
    return { grupo: g, aprobadas: aprobadasG.length, exigidas: g.cantidadExigida };
  });

  const porcentaje = total > 0 ? Math.min(100, Math.round((hecho / total) * 1000) / 10) : 0;
  return {
    porcentaje,
    aprobado: hecho,
    total,
    unidad,
    obligatoriasAprobadas: obligatorias.filter(aprobada).length,
    obligatoriasTotales: obligatorias.length,
    optativas,
  };
}

/**
 * Promedio general de las materias aprobadas con nota.
 * Si `ponderarPor` es 'horas' o 'creditos', pondera por eso.
 */
export function promedioGeneral(
  materias: Materia[],
  estados: Map<string, EstadoEstudiante>,
  ponderarPor: 'ninguno' | 'horas' | 'creditos' = 'ninguno',
): number | null {
  let suma = 0;
  let pesos = 0;
  for (const m of materias) {
    const e = estados.get(m.id);
    if (e?.estado !== 'aprobada' || e.notaFinal == null || esSeminario(m.nombre)) continue;
    const w = ponderarPor === 'ninguno' ? 1 : peso(m, ponderarPor) || 0;
    if (w <= 0) continue;
    suma += e.notaFinal * w;
    pesos += w;
  }
  return pesos > 0 ? Math.round((suma / pesos) * 100) / 100 : null;
}

/** Materias que se desbloquean al aprobar/firmar `materiaId` (útil para mostrar "ahora podés cursar..."). */
export function seDesbloquean(
  materiaId: string,
  nuevoEstado: EstadoMateria,
  prerrequisitos: Prerrequisito[],
  estados: Map<string, EstadoEstudiante>,
): string[] {
  const despues = new Map(estados);
  despues.set(materiaId, { ...(estados.get(materiaId) ?? {}), estado: nuevoEstado });
  const candidatas = new Set(prerrequisitos.filter((p) => p.requiereId === materiaId).map((p) => p.materiaId));
  return [...candidatas].filter(
    (id) => !estaDesbloqueada(id, prerrequisitos, estados) && estaDesbloqueada(id, prerrequisitos, despues),
  );
}
