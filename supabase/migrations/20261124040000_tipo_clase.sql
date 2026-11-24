-- Tipo de cada clase del horario: Teoría, RP (resolución de problemas) o
-- Laboratorio. Queda vacío (null) en las clases cargadas antes: la app no
-- les muestra tipo hasta que el estudiante las edite.
-- Se puede re-ejecutar sin problema.

alter table public.horario add column if not exists tipo_clase text;

alter table public.horario drop constraint if exists horario_tipo_clase_check;
alter table public.horario add constraint horario_tipo_clase_check
  check (tipo_clase in ('teoria', 'rp', 'laboratorio'));

comment on column public.horario.tipo_clase is 'teoria | rp | laboratorio; null = sin indicar';
