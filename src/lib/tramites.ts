/**
 * Guía de trámites: tipos y funciones puras (búsqueda, agrupado por
 * categoría y validación del formulario del panel de admin).
 */

export type Modalidad = 'presencial' | 'etramite' | 'mixto';

/** Lo que se guarda de un trámite (sin id ni orden). */
export type TramiteNuevo = {
  clave: string | null;
  categoria: string;
  nombre: string;
  descripcion: string | null;
  pasos: string[];
  requisitos: string[];
  costo: string | null;
  donde: string | null;
  plazo: string | null;
  contacto: string | null;
  modalidad: Modalidad | null;
  formulario_url: string | null;
  fuente_url: string | null;
};

export const CATEGORIAS_TRAMITE = [
  'Inscripciones y matrícula',
  'Exámenes',
  'Certificados y constancias',
  'Cambios de carrera y equivalencias',
  'Becas y exoneraciones',
  'Egreso y título',
  'Servicios',
  'Otros',
] as const;

export const TEXTO_MODALIDAD: Record<Modalidad, string> = {
  presencial: 'Presencial',
  etramite: 'En línea (e-Trámite)',
  mixto: 'Presencial o por correo',
};

export const LIMITE_NOMBRE_TRAMITE = 120;
export const LIMITE_TEXTO_TRAMITE = 4000;

/** Minúsculas y sin tildes, para buscar "inscripcion" y encontrar "Inscripción". */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

type Buscable = Pick<TramiteNuevo, 'nombre' | 'categoria' | 'descripcion' | 'pasos' | 'requisitos'>;

/** Filtra por todas las palabras de la búsqueda (en cualquier orden y campo). */
export function filtrarTramites<T extends Buscable>(tramites: T[], busqueda: string, categoria: string | null = null): T[] {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  return tramites.filter((t) => {
    if (categoria && t.categoria !== categoria) return false;
    if (!palabras.length) return true;
    const texto = normalizar([t.nombre, t.categoria, t.descripcion ?? '', ...t.pasos, ...t.requisitos].join(' '));
    return palabras.every((p) => texto.includes(p));
  });
}

/** Agrupa respetando el orden de CATEGORIAS_TRAMITE; las desconocidas van al final. */
export function agruparPorCategoria<T extends { categoria: string }>(tramites: T[]): { categoria: string; tramites: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const t of tramites) {
    const lista = grupos.get(t.categoria) ?? [];
    lista.push(t);
    grupos.set(t.categoria, lista);
  }
  const orden = (c: string) => {
    const i = (CATEGORIAS_TRAMITE as readonly string[]).indexOf(c);
    return i === -1 ? CATEGORIAS_TRAMITE.length - 1 : i;
  };
  return [...grupos.entries()]
    .sort(([a], [b]) => orden(a) - orden(b) || a.localeCompare(b, 'es'))
    .map(([categoria, lista]) => ({ categoria, tramites: lista }));
}

/** Un renglón por elemento: así se cargan pasos y requisitos en el panel. */
export function lineas(texto: string): string[] {
  return texto.split('\n').map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
}

const vacioANull = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

export interface FormularioTramite {
  nombre: string;
  categoria: string;
  descripcion: string;
  pasos: string;
  requisitos: string;
  costo: string;
  donde: string;
  plazo: string;
  contacto: string;
  modalidad: Modalidad | null;
  formulario_url: string;
  fuente_url: string;
}

/** Valida el formulario del panel y lo convierte en lo que se guarda. */
export function validarTramite(f: FormularioTramite, clave: string | null = null): { tramite: TramiteNuevo } | { error: string } {
  const nombre = f.nombre.trim();
  if (nombre.length < 3) return { error: 'Poné un nombre de al menos 3 letras.' };
  if (nombre.length > LIMITE_NOMBRE_TRAMITE) return { error: `El nombre puede tener hasta ${LIMITE_NOMBRE_TRAMITE} caracteres.` };
  const categoria = f.categoria.trim() || 'Otros';
  const pasos = lineas(f.pasos);
  if (!pasos.length) return { error: 'Escribí al menos un paso (uno por renglón).' };
  const largos = [f.descripcion, f.pasos, f.requisitos, f.costo, f.donde, f.plazo, f.contacto];
  if (largos.some((t) => t.length > LIMITE_TEXTO_TRAMITE)) return { error: `Cada campo puede tener hasta ${LIMITE_TEXTO_TRAMITE} caracteres.` };
  for (const [etiqueta, url] of [['formulario', f.formulario_url], ['fuente', f.fuente_url]] as const) {
    const u = url.trim();
    if (u && !/^https:\/\/\S+$/i.test(u)) return { error: `El enlace del ${etiqueta} tiene que empezar con https://` };
  }
  return {
    tramite: {
      clave,
      categoria,
      nombre,
      descripcion: vacioANull(f.descripcion),
      pasos,
      requisitos: lineas(f.requisitos),
      costo: vacioANull(f.costo),
      donde: vacioANull(f.donde),
      plazo: vacioANull(f.plazo),
      contacto: vacioANull(f.contacto),
      modalidad: f.modalidad,
      formulario_url: vacioANull(f.formulario_url),
      fuente_url: vacioANull(f.fuente_url),
    },
  };
}

/** Lo inverso: un trámite guardado como texto editable. */
export function aFormulario(t: TramiteNuevo): FormularioTramite {
  return {
    nombre: t.nombre,
    categoria: t.categoria,
    descripcion: t.descripcion ?? '',
    pasos: t.pasos.join('\n'),
    requisitos: t.requisitos.join('\n'),
    costo: t.costo ?? '',
    donde: t.donde ?? '',
    plazo: t.plazo ?? '',
    contacto: t.contacto ?? '',
    modalidad: t.modalidad,
    formulario_url: t.formulario_url ?? '',
    fuente_url: t.fuente_url ?? '',
  };
}

/** Escapa un texto para SQL ('...'). */
function sqlTexto(s: string | null): string {
  return s == null ? 'null' : `'${s.replace(/'/g, "''")}'`;
}

function sqlArreglo(a: string[]): string {
  return a.length ? `array[${a.map(sqlTexto).join(', ')}]::text[]` : `'{}'::text[]`;
}

/**
 * Genera el INSERT de los datos iniciales. ON CONFLICT (clave) DO NOTHING:
 * re-ejecutar la migración no pisa lo que el CEQ editó desde el panel.
 */
export function sqlSemilla(tramites: TramiteNuevo[]): string {
  const filas = tramites.map((t, i) =>
    `  (${[
      sqlTexto(t.clave), sqlTexto(t.categoria), sqlTexto(t.nombre), sqlTexto(t.descripcion), sqlArreglo(t.pasos), sqlArreglo(t.requisitos),
      sqlTexto(t.costo), sqlTexto(t.donde), sqlTexto(t.plazo), sqlTexto(t.contacto), sqlTexto(t.modalidad), sqlTexto(t.formulario_url),
      sqlTexto(t.fuente_url), String(i * 10),
    ].join(', ')})`,
  );
  return [
    'insert into public.tramites (clave, categoria, nombre, descripcion, pasos, requisitos, costo, donde, plazo, contacto, modalidad, formulario_url, fuente_url, orden) values',
    filas.join(',\n'),
    'on conflict (clave) do nothing;',
  ].join('\n');
}
