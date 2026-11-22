-- Valores por defecto según el Reglamento de Régimen Académico de la FCQ
-- (Res. CSU 0108-00-2024, Art. 7, 43).
--  * Teoría ≥ 50 %, prácticos ≥ 60 %, asistencia a teoría ≥ 60 %,
--    100 % de las prácticas cumplidas.
--  * Los prerrequisitos son de materias APROBADAS.
alter table public.reglas_firma
  alter column minimo_teoria set default 50,
  alter column minimo_laboratorio set default 60,
  alter column minimo_asistencia set default 60,
  alter column minimo_asistencia_lab set default 100;

alter table public.prerrequisitos
  alter column tipo set default 'aprobada';
