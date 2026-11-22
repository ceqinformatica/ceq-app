-- El examen de recuperación (Art. 46) también usa un llamado de final, y
-- solo se rinde en el 1.er llamado. La regularización (Art. 40–41) se rinde
-- en el 1.º o el 2.º llamado. Ninguno de los dos lleva nota de final.
alter table public.examenes_finales
  drop constraint if exists examenes_finales_tipo_check;
alter table public.examenes_finales
  add constraint examenes_finales_tipo_check check (tipo in ('final', 'regularizacion', 'recuperatorio'));
alter table public.examenes_finales
  drop constraint if exists examenes_finales_nota_segun_tipo;
alter table public.examenes_finales
  add constraint examenes_finales_nota_segun_tipo
  check ((tipo = 'final' and nota is not null) or (tipo <> 'final' and nota is null and porcentaje is null));
alter table public.examenes_finales
  drop constraint if exists examenes_finales_llamado_segun_tipo;
alter table public.examenes_finales
  add constraint examenes_finales_llamado_segun_tipo
  check (tipo = 'final' or llamado is null
         or (tipo = 'recuperatorio' and llamado = 1)
         or (tipo = 'regularizacion' and llamado in (1, 2)));
