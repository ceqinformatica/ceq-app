-- Porcentaje que sacó el estudiante en el examen final (0 a 100). Con su
-- promedio de firma la app calcula la nota: 0,4 × firma + 0,6 × final
-- (Art. 57). Es opcional: también se puede cargar la nota directo.
alter table public.examenes_finales
  add column if not exists porcentaje numeric(5,2) check (porcentaje between 0 and 100);
