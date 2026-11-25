/**
 * Intentos de examen final (1.º, 2.º y 3.er llamado) y promedios
 * con y sin aplazos. Funciones puras.
 */
import { esSeminario, type EstadoEstudiante, type EstadoMateria, type Materia } from './progreso.ts';
import type { TipoExamen } from './tipos-db.ts';

export interface IntentoFinal {
  materiaId: string;
  /** 1 a 5 (escala FCQ). 1 = aplazo. */
  nota: number;
  llamado?: number | null;
  periodo?: string | null;
  fecha?: string | null;
  /** Regularización o recuperatorio: llamado usado sin nota de final, no cuenta. */
  tipo?: TipoExamen;
}

/** Solo los exámenes finales cuentan para aprobar y para los promedios. */
const esFinal = (i: Pick<IntentoFinal, 'tipo'>) => (i.tipo ?? 'final') === 'final';

export { esSeminario };

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Intentos de una materia en orden: por fecha, y si no hay fecha por periodo y llamado. */
export function intentosDe(materiaId: string, intentos: IntentoFinal[]): IntentoFinal[] {
  return intentos
    .filter((i) => i.materiaId === materiaId && esFinal(i))
    .sort((a, b) =>
      (a.fecha ?? '').localeCompare(b.fecha ?? '') ||
      (a.periodo ?? '').localeCompare(b.periodo ?? '') ||
      (a.llamado ?? 0) - (b.llamado ?? 0));
}

/** Mejor nota aprobada (≥ 2) de una materia, o null si todavía no aprobó el final. */
export function notaAprobada(materiaId: string, intentos: IntentoFinal[]): number | null {
  const ok = intentos.filter((i) => i.materiaId === materiaId && esFinal(i) && i.nota >= 2).map((i) => i.nota);
  return ok.length ? Math.max(...ok) : null;
}

export interface Promedios {
  /** Solo la nota con la que aprobó cada materia. */
  sinAplazos: number | null;
  /** Todas las notas de final, incluidos los aplazos (1). */
  conAplazos: number | null;
  aplazos: number;
}

/**
 * Intentos que cuentan según el estado de cada materia. Si una materia tiene
 * un final aprobado cargado pero el estudiante la devolvió a firmada (o a otro
 * estado que no es aprobada), ese aprobado se tomó por error: no cuenta en
 * promedios, gráficos ni efectividad. Los aplazos sí se conservan. Una
 * materia sin estado guardado se juzga solo por sus intentos.
 */
export function intentosQueCuentan(
  intentos: IntentoFinal[],
  estados: Map<string, Pick<EstadoEstudiante, 'estado'>>,
): IntentoFinal[] {
  return intentos.filter((i) => {
    if (i.nota < 2) return true;
    const e = estados.get(i.materiaId);
    return !e || e.estado === 'aprobada';
  });
}

/**
 * Promedios de la carrera. Las materias aprobadas sin intentos cargados
 * (por ejemplo, marcadas en bloque con su nota) cuentan su nota final una vez.
 */
export function promedios(
  materias: (Pick<Materia, 'id'> & { nombre?: string })[],
  estados: Map<string, EstadoEstudiante>,
  intentos: IntentoFinal[],
): Promedios {
  // Los seminarios no llevan nota: no entran en el promedio.
  const delPlan = new Set(materias.filter((m) => !m.nombre || !esSeminario(m.nombre)).map((m) => m.id));
  const notasAprobadas: number[] = [];
  const todas: number[] = [];
  let aplazos = 0;
  const validos = intentosQueCuentan(intentos, estados);
  for (const id of delPlan) {
    const e = estados.get(id);
    const propios = validos.filter((i) => i.materiaId === id && esFinal(i));
    for (const i of propios) {
      todas.push(i.nota);
      if (i.nota < 2) aplazos++;
    }
    const aprobada = notaAprobada(id, propios) ?? (e?.estado === 'aprobada' ? e.notaFinal ?? null : null);
    // Solo notas de aprobación válidas (2 a 5): una nota mal cargada no entra al promedio.
    if (aprobada != null && aprobada >= 2 && aprobada <= 5) {
      notasAprobadas.push(aprobada);
      if (!propios.some((i) => i.nota >= 2)) todas.push(aprobada);
    }
  }
  const prom = (xs: number[]) => (xs.length ? redondear(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  return { sinAplazos: prom(notasAprobadas), conAplazos: prom(todas), aplazos };
}

/** Periodo académico de una fecha: "2026-1" (feb–jul) o "2026-2" (ago–dic). Enero cuenta como el 2.º del año anterior. */
export function periodoDe(fecha: Date = new Date()): string {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth(); // 0 = enero
  if (mes === 0) return `${anio - 1}-2`;
  return `${anio}-${mes <= 6 ? 1 : 2}`;
}

export interface LlamadoCargado {
  llamado: 1 | 2 | 3;
  /** Regularización o recuperatorio: el llamado queda usado, sin nota. */
  tipo?: TipoExamen;
  /** Porcentaje del examen final (0 a 100), si lo cargó así. */
  porcentaje: number | null;
  /** Nota del llamado (1 a 5); null si se usó para regularizar, espera la nota o estuvo ausente. */
  nota: number | null;
  /** Día del examen (AAAA-MM-DD), opcional. */
  fecha?: string | null;
}

/** Final rendido: con nota o esperando la nota. Gasta uno de los 3 llamados de la materia. */
export const esFinalRendido = (tipo: string | null | undefined) => (tipo ?? 'final') === 'final' || tipo === 'pendiente';

/**
 * Nota de un llamado: con el porcentaje del final y el promedio de firma
 * (0,4 × firma + 0,6 × final, el final tiene que llegar a 60 %), o la nota
 * cargada directo. null si el llamado quedó vacío.
 */
export function notaDelLlamado(
  firma: number | null,
  porcentaje: number | null,
  notaDirecta: number | null,
  calcular: (pg: number, ef: number) => { nota: number },
): number | null {
  if (porcentaje != null && firma != null) return calcular(firma, porcentaje).nota;
  if (notaDirecta != null && notaDirecta >= 1 && notaDirecta <= 5) return Math.round(notaDirecta);
  return null;
}

/** Aplazos que obligan a recursar (Art. 62). */
export const APLAZOS_PARA_RECURSAR = 3;

/**
 * Aplazos de la cursada actual (los intentos de antes de recursar no
 * cuentan). Con tres aplazos sin aprobar tiene que volver a cursar.
 */
export function aplazosDeLaCursada(
  finales: { nota: number | null; tipo?: string | null; cursada_anterior?: boolean | null }[],
): { aplazos: number; debeRecursar: boolean } {
  const propios = finales.filter((f) => (f.tipo ?? 'final') === 'final' && f.nota != null && !f.cursada_anterior);
  const aplazos = propios.filter((f) => (f.nota as number) < 2).length;
  const aprobo = propios.some((f) => (f.nota as number) >= 2);
  return { aplazos, debeRecursar: !aprobo && aplazos >= APLAZOS_PARA_RECURSAR };
}

/**
 * Vigencia de la firma (Art. 49, 50 y 62): la habilitación dura dos periodos
 * académicos en que se OFRECE la materia. El registro personal no sabe en
 * qué periodos se ofreció, así que la app nunca afirma que la firma venció:
 * si en la cursada actual hay llamados en dos periodos distintos sin aprobar
 * y se mira un periodo posterior (o ya hay un tercero), devuelve esos
 * periodos para pedirle al estudiante que lo confirme. null si no hay nada
 * que revisar.
 */
export function vigenciaPorConfirmar(
  finales: { nota: number | null; tipo?: string | null; periodo?: string | null; cursada_anterior?: boolean | null }[],
  periodoActual: string,
): { periodos: string[] } | null {
  const propios = finales.filter((f) => !f.cursada_anterior);
  if (propios.some((f) => (f.tipo ?? 'final') === 'final' && f.nota != null && f.nota >= 2)) return null;
  const periodos = [...new Set(propios.map((f) => f.periodo).filter((p): p is string => !!p))].sort();
  if (periodos.length < 2) return null;
  return periodos.length > 2 || periodoActual > periodos[1] ? { periodos } : null;
}

/**
 * Finales de la cursada actual sin semestre ni llamado (los importados del
 * extracto se guardaban así). Mientras haya alguno, no se sabe cuántos de
 * los 3 finales quedan: pueden ser de una cursada anterior.
 */
export function finalesSinUbicar<T extends { llamado?: number | null; tipo?: string | null; cursada_anterior?: boolean | null }>(finales: T[]): T[] {
  return finales.filter((f) => !f.cursada_anterior && f.llamado == null && esFinalRendido(f.tipo));
}

/**
 * Semestre en que la materia quedó firmada o aprobada (la agenda la sigue
 * mostrando ese semestre). Solo se marca al pasar a firmada o aprobada
 * desde la materia; si no cambia el estado, se conserva. Las cargas en
 * bloque del historial no lo marcan.
 */
export function periodoAlCambiar(antes: EstadoMateria | null, periodoAntes: string | null, ahora: EstadoMateria, hoy: string = periodoDe()): string | null {
  if (ahora !== 'firmada' && ahora !== 'aprobada') return null;
  if (antes === ahora) return periodoAntes;
  // De firmada a aprobada (o al revés): se conserva el semestre de la firma.
  if (antes === 'firmada' || antes === 'aprobada') return periodoAntes;
  return hoy;
}

/** Periodo anterior: "2026-1" → "2025-2". */
export function periodoAnterior(p: string): string {
  const [a, n] = p.split('-').map(Number);
  return n === 2 ? `${a}-1` : `${a - 1}-2`;
}

/** Periodo siguiente: "2025-2" → "2026-1". */
export function periodoSiguiente(p: string): string {
  const [a, n] = p.split('-').map(Number);
  return n === 1 ? `${a}-2` : `${a + 1}-1`;
}

/**
 * Semestres en que se pueden cargar finales, del más nuevo al más viejo:
 * desde el semestre en que firmó hasta este (el siguiente al de la firma es
 * el semestre opuesto), más los que ya tienen finales guardados. Si no se
 * sabe cuándo firmó, este semestre y el anterior. Como mucho cuatro desde la
 * firma, para no llenar la lista.
 */
export function periodosParaFinales(periodoFirma: string | null | undefined, actual: string, conFinales: string[] = []): string[] {
  const lista = new Set<string>(conFinales);
  if (periodoFirma && periodoFirma <= actual) {
    let p = periodoFirma;
    for (let i = 0; i < 4 && p <= actual; i++, p = periodoSiguiente(p)) lista.add(p);
    lista.add(actual);
  } else {
    lista.add(actual);
    lista.add(periodoAnterior(actual));
  }
  return [...lista].sort().reverse();
}

/**
 * Recu o Regu después de haber rendido un final: no corresponde, porque al
 * final se llega con la firma y la Regu o el Recu son para conseguirla.
 * Recibe los llamados de la cursada actual (de todos los semestres) y
 * devuelve el primero que está fuera de orden, o null.
 */
export function recuReguDespuesDeFinal<T extends { periodo: string | null; llamado: number | null; tipo?: string | null; nota?: number | null }>(llamados: T[]): T | null {
  const orden = [...llamados].sort((a, b) => (a.periodo ?? '').localeCompare(b.periodo ?? '') || (a.llamado ?? 0) - (b.llamado ?? 0));
  let rindioFinal = false;
  for (const l of orden) {
    const tipo = l.tipo ?? 'final';
    // Estar ausente no es rendir: no cambia nada.
    if (tipo === 'ausente') continue;
    if (esFinalRendido(tipo)) rindioFinal = true;
    else if (rindioFinal) return l;
  }
  return null;
}

/** Llamados por materia: se comparten entre el semestre normal y el opuesto. */
export const LLAMADOS_POR_MATERIA = 3;

/**
 * Finales rendidos en la cursada actual (con nota o esperando la nota). El
 * Recu y la Regu son parciales y estar ausente no es rendir: no gastan un final.
 */
export function llamadosUsados(finales: { llamado?: number | null; tipo?: string | null; cursada_anterior?: boolean | null }[]): number {
  return finales.filter((f) => f.llamado != null && !f.cursada_anterior && esFinalRendido(f.tipo)).length;
}

/**
 * Finales que le quedan de los 3 en la cursada actual, o null si hay
 * importados sin ubicar (el saldo no se puede calcular todavía).
 */
export function llamadosRestantes(finales: { llamado?: number | null; tipo?: string | null; cursada_anterior?: boolean | null }[]): number | null {
  if (finalesSinUbicar(finales).length) return null;
  return Math.max(0, LLAMADOS_POR_MATERIA - llamadosUsados(finales));
}

export type MotivoSinOpuesto = 'llamados' | 'aplazos' | 'sinUbicar' | 'aprobada' | 'plan';

/**
 * ¿Puede volver a cursar en el semestre opuesto? (Res. 0108-00-2024)
 * - Art. 62: con tres aplazos lo pierde (la firma vencida también, pero eso
 *   lo confirma el estudiante: ver vigenciaPorConfirmar).
 * - Con finales importados sin ubicar no se sabe cuántos quedan.
 * - Los tres llamados son de la materia: si ya los usó todos, no hay opuesto.
 * - Art. 23 (plan 2018): una resolución posterior lo abre; hoy no se oculta para ningún plan
 *   (se respeta solo si `sinOpuestoEnPlan` es true).
 * Las prácticas aprobadas y la asistencia cumplida (Art. 7 c) las confirma
 * el estudiante.
 */
export function semestreOpuesto(params: {
  finales: { nota: number | null; tipo?: string | null; periodo?: string | null; llamado?: number | null; cursada_anterior?: boolean | null }[];
  aprobada?: boolean;
  periodoActual?: string;
  sinOpuestoEnPlan?: boolean;
}): { puede: boolean; motivo: MotivoSinOpuesto | null; llamadosRestantes: number | null } {
  const restantes = llamadosRestantes(params.finales);
  const no = (motivo: MotivoSinOpuesto) => ({ puede: false, motivo, llamadosRestantes: restantes });
  if (params.aprobada) return no('aprobada');
  if (aplazosDeLaCursada(params.finales).debeRecursar) return no('aplazos');
  if (restantes == null) return no('sinUbicar');
  if (restantes === 0) return no('llamados');
  if (params.sinOpuestoEnPlan) return no('plan');
  return { puede: true, motivo: null, llamadosRestantes: restantes };
}

export const TEXTO_SIN_OPUESTO: Record<MotivoSinOpuesto, string> = {
  llamados: 'Ya rendiste los 3 finales de esta materia: no te queda ninguno para el semestre opuesto.',
  aplazos: 'Con 3 aplazos tenés que volver a cursarla entera y perdés el semestre opuesto (Art. 62).',
  sinUbicar: 'Tenés finales importados del extracto sin ubicar: indicá en Finales el semestre y el llamado de cada uno (o si son de una cursada anterior) para saber cuántos te quedan.',
  aprobada: 'Ya aprobaste esta materia.',
  plan: 'Esta materia no se ofrece en semestre opuesto.',
};

/** "2026-2" → "Segundo semestre de 2026". */
export function nombreSemestre(p: string): string {
  const [anio, n] = p.split('-');
  return `${n === '1' ? 'Primer' : 'Segundo'} semestre de ${anio}`;
}

/** 1 → "Primer llamado". */
export const nombreLlamado = (n: number) => `${['Primer', 'Segundo', 'Tercer'][n - 1] ?? `${n}.º`} llamado`;

/** Cómo se ve un resultado en el historial de Finales. */
export function tituloResultado(f: { tipo?: string | null; nota: number | null }): string {
  switch (f.tipo ?? 'final') {
    case 'pendiente': return 'Resultado pendiente';
    case 'ausente': return 'Ausente';
    case 'regularizacion': return 'Regu · Regularización';
    case 'recuperatorio': return 'Recu · Recuperación';
    default: return f.nota != null && f.nota >= 2 ? `Aprobada · ${f.nota}` : `Aplazo · ${f.nota ?? 1}`;
  }
}
