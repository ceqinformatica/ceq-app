/**
 * Ordenar materias por nivel (Primer nivel, Segundo nivel…) en vez de
 * alfabéticamente. Pedido de Josie (2026-11-26) para la carga de finales.
 */

export interface MateriaConNivel {
  nombre: string;
  plan: number | null;
  nivel: number | null;
  orden?: number | null;
}

/**
 * Nivel de cada materia por nombre. Con un plan elegido manda ese plan; si
 * la materia no está en él (o no hay plan), el nivel más bajo en que aparece.
 * El orden dentro del nivel es el de la malla.
 */
export function nivelesPorMateria(fichas: MateriaConNivel[], plan?: number | null): Map<string, { nivel: number | null; orden: number | null }> {
  const res = new Map<string, { nivel: number | null; orden: number | null; delPlan: boolean }>();
  for (const f of fichas) {
    const delPlan = plan != null && f.plan === plan;
    const previo = res.get(f.nombre);
    const mejor =
      !previo ||
      (delPlan && !previo.delPlan) ||
      (delPlan === previo.delPlan && (previo.nivel == null || (f.nivel != null && f.nivel < previo.nivel)));
    if (mejor) res.set(f.nombre, { nivel: f.nivel, orden: f.orden ?? null, delPlan });
  }
  return new Map([...res].map(([k, v]) => [k, { nivel: v.nivel, orden: v.orden }]));
}

/** Por nivel, después por el orden de la malla y al final por nombre. Sin nivel, al final. */
export function compararPorNivel(niveles: Map<string, { nivel: number | null; orden: number | null }>, a: string, b: string): number {
  const na = niveles.get(a);
  const nb = niveles.get(b);
  const nivA = na?.nivel ?? Infinity;
  const nivB = nb?.nivel ?? Infinity;
  if (nivA !== nivB) return nivA - nivB;
  const ordA = na?.orden ?? Infinity;
  const ordB = nb?.orden ?? Infinity;
  if (ordA !== ordB) return ordA - ordB;
  return a.localeCompare(b, 'es');
}
