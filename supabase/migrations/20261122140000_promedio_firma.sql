-- Promedio con el que el estudiante firmó la materia (teoría y laboratorio
-- promediados, 0 a 100). Lo guarda el botón "Guardar firma" de la
-- calculadora y se muestra al marcar la materia como firmada.
alter table public.materias_estudiante
  add column if not exists promedio_firma numeric(5,2) check (promedio_firma between 0 and 100);
