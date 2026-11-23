-- La firma es un porcentaje entero: desde 0,5 se redondea hacia arriba
-- (Josie: "tengo 90.5 y eso ya es 91"). Las firmas guardadas antes con
-- decimales pasan al entero. round() de numeric redondea 0,5 hacia arriba.
-- Se puede volver a ejecutar.
update public.materias_estudiante
   set promedio_firma = round(promedio_firma)
 where promedio_firma is not null and promedio_firma <> round(promedio_firma);
