/**
 * Horarios de clases oficiales que publica la FCQ (un PDF por carrera).
 * Fuente: https://www.qui.una.py/horario-de-clases/
 * Los PDF son imágenes escaneadas, así que no se pueden importar solos:
 * la app los abre para que el estudiante copie sus clases.
 * Actualizar los enlaces al comienzo de cada periodo.
 */
export const PAGINA_HORARIOS_FCQ = 'https://www.qui.una.py/horario-de-clases/';
export const PERIODO_HORARIOS_FCQ = '2.º periodo 2026';

const PDF = 'https://www.qui.una.py/v3/wp-content/uploads/2026/08/';

/** id de carrera (seed_fcq.sql) → PDF de su horario. */
const POR_CARRERA: Record<string, string> = {
  '6b26f572-4d8f-5076-88d3-2f2bafa8c092': PDF + 'FARMACIA_VF_13_AGOSTO_2026.pdf', // Farmacia
  '9528764d-7180-5db8-852f-ab07e618ca29': PDF + '02_BIOQUIMICA_HORARIO.pdf', // Bioquímica
  'effba2b9-1b56-5015-9d78-782946d17b60': PDF + '03_INGENIERIA-QUIMICA_HORARIO.pdf', // Ingeniería Química
  'e4c35c13-b8f0-5e40-9700-f3ac50d0ed18': PDF + '04_QUIMICA-INDUSTRIAL_HORARIO.pdf', // Química Industrial
  '6aee2eab-6bd4-5bc5-947e-3105a329864d': PDF + '05_CTA_HORARIO.pdf', // Ciencia y Tecnología de Alimentos
  '62b78cf9-4938-5263-869a-1d7b03208bb7': PDF + '06_NUTRICION_HORARIO.pdf', // Nutrición
  '04271a91-425c-5e60-96ce-2252ac3a199c': PDF + 'INGENIERIA-DE-ALIMENTOS_VF_24_AGOST_2026.pdf', // Ingeniería de Alimentos
};

/** El PDF del horario de tu carrera, o la página con todos si no lo tenemos. */
export function horarioOficialDe(carreraId: string | null | undefined): { url: string; deTuCarrera: boolean } {
  const url = carreraId ? POR_CARRERA[carreraId] : undefined;
  return url ? { url, deTuCarrera: true } : { url: PAGINA_HORARIOS_FCQ, deTuCarrera: false };
}
