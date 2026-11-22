-- Regularización y recursada (Res. CSU 0108-00-2024).
--
-- Regularización (Art. 40–41): quien faltó a un parcial de teoría rinde un
-- examen de regularización en un llamado de final. Ese llamado queda usado
-- (no se puede rendir el final en el mismo llamado) y no lleva nota de final:
-- no cuenta para aprobar la materia ni para los promedios.
alter table public.examenes_finales
  add column if not exists tipo text not null default 'final';
alter table public.examenes_finales
  drop constraint if exists examenes_finales_tipo_check;
alter table public.examenes_finales
  add constraint examenes_finales_tipo_check check (tipo in ('final', 'regularizacion'));
alter table public.examenes_finales alter column nota drop not null;
alter table public.examenes_finales
  drop constraint if exists examenes_finales_nota_segun_tipo;
alter table public.examenes_finales
  add constraint examenes_finales_nota_segun_tipo
  check ((tipo = 'final' and nota is not null) or (tipo = 'regularizacion' and nota is null and porcentaje is null));

-- Recursada (Art. 45, 49–50 y 62): al volver a cursar, los intentos de la
-- cursada anterior quedan marcados. Siguen en el historial (los aplazos
-- cuentan para el promedio con aplazos), pero los tres llamados se cuentan
-- de nuevo y la tarjeta de finales ya no los edita.
alter table public.examenes_finales
  add column if not exists cursada_anterior boolean not null default false;

-- Solo los finales aprueban la materia.
create or replace function public.recalcular_final(u uuid, m uuid)
returns void language plpgsql set search_path = public as $$
declare
  mejor smallint;
  ultima date;
begin
  select max(nota), max(fecha) into mejor, ultima
  from public.examenes_finales
  where usuario_id = u and materia_id = m and tipo = 'final' and nota >= 2;

  if mejor is not null then
    insert into public.materias_estudiante (usuario_id, materia_id, estado, nota_final, fecha, nota_desde_final)
    values (u, m, 'aprobada', mejor, ultima, true)
    on conflict (usuario_id, materia_id)
    do update set estado = 'aprobada', nota_final = excluded.nota_final, nota_desde_final = true,
                  fecha = coalesce(excluded.fecha, public.materias_estudiante.fecha);
  else
    update public.materias_estudiante
       set estado = 'firmada', nota_final = null, nota_desde_final = false
     where usuario_id = u and materia_id = m and nota_desde_final;
  end if;
end;
$$;

create or replace function public.sincronizar_final()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalcular_final(old.usuario_id, old.materia_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or new.usuario_id is distinct from old.usuario_id or new.materia_id is distinct from old.materia_id
          or new.nota is distinct from old.nota or new.fecha is distinct from old.fecha or new.tipo is distinct from old.tipo) then
    perform public.recalcular_final(new.usuario_id, new.materia_id);
  end if;
  return null;
end;
$$;
