/**
 * Estado del aviso a los estudiantes de un horario publicado (clases o
 * finales). El aviso se guarda aparte de la publicación (avisado_en): se
 * puede publicar sin avisar y avisar en una publicación posterior. Sin la
 * migración que agrega avisado_en, el servidor solo avisa en la primera
 * publicación, y eso es lo que se muestra.
 */
export type EstadoAviso = 'pendiente' | 'avisado' | 'ya_no_se_puede';

export function estadoAviso(h: { publicado_en: string | null; avisado_en?: string | null } | null | undefined): EstadoAviso {
  if (!h) return 'pendiente';
  if ('avisado_en' in h && h.avisado_en !== undefined) return h.avisado_en ? 'avisado' : 'pendiente';
  return h.publicado_en ? 'ya_no_se_puede' : 'pendiente';
}

export const TEXTO_AVISO: Record<EstadoAviso, string> = {
  pendiente: 'Les llega una notificación al publicar.',
  avisado: 'Ya se avisó a los estudiantes.',
  ya_no_se_puede: 'Ya se publicó una vez sin aviso: el aviso solo sale en la primera publicación.',
};
