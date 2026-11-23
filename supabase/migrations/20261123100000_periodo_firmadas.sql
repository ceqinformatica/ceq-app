-- Agenda: las materias firmadas este semestre siguen apareciendo al cargar
-- clases. El semestre de la firma se guarda en materias_estudiante.periodo
-- desde esta versión; las firmadas de antes (sin periodo) solo pueden venir
-- de acciones por materia (las cargas en bloque marcan aprobada o
-- cursando), así que se toman como de este semestre (2026-2, la app es de
-- noviembre de 2026). Las aprobadas sin periodo no se tocan: incluyen el
-- historial importado. Se puede volver a ejecutar.
update public.materias_estudiante
   set periodo = '2026-2'
 where periodo is null and estado = 'firmada';
