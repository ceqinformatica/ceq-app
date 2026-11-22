-- Intentos de examen final por llamado.
-- Cada fila es una vez que el estudiante rindió el final de una materia
-- (1.º, 2.º o 3.er llamado de un periodo). Sirve para:
--  * guardar el 1 del primer llamado y el 5 del segundo,
--  * calcular el promedio con aplazos (todas las notas) y sin aplazos
--    (solo la nota con la que aprobó).
-- Al cargar un intento aprobado (nota ≥ 2) la materia queda aprobada con
-- esa nota en materias_estudiante.
create table if not exists public.examenes_finales (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  materia_id  uuid not null references public.materias(id) on delete cascade,
  periodo     text,                                   -- ej. "2025-2"
  llamado     smallint check (llamado between 1 and 3),
  fecha       date,
  nota        smallint not null check (nota between 1 and 5),
  created_at  timestamptz not null default now()
);
create index if not exists examenes_finales_usuario_materia on public.examenes_finales (usuario_id, materia_id);

alter table public.examenes_finales enable row level security;
revoke truncate, references, trigger on public.examenes_finales from anon, authenticated;
revoke all on public.examenes_finales from anon;
drop policy if exists "dueño examenes_finales" on public.examenes_finales;
create policy "dueño examenes_finales" on public.examenes_finales for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

-- Un mismo llamado de un periodo se carga una sola vez.
create unique index if not exists examenes_finales_un_intento
  on public.examenes_finales (usuario_id, materia_id, periodo, llamado)
  where periodo is not null and llamado is not null;

-- Marca si la nota de la materia vino de un intento de final cargado acá
-- (true) o se cargó a mano o en bloque (false). Solo las que vinieron de
-- un intento se deshacen al borrar ese intento.
alter table public.materias_estudiante
  add column if not exists nota_desde_final boolean not null default false;

-- Mantiene materias_estudiante al día con el mejor intento aprobado:
--  * Si hay intentos con nota >= 2, la materia queda aprobada con la mejor
--    nota (el acta manda sobre una nota cargada a mano).
--  * Si ya no queda ningún intento aprobado y la nota venía de un intento,
--    la materia vuelve a 'firmada' sin nota. Las aprobadas a mano o en
--    bloque no se tocan.
-- Corre con los permisos de quien carga el intento (RLS incluido).
create or replace function public.recalcular_final(u uuid, m uuid)
returns void language plpgsql set search_path = public as $$
declare
  mejor smallint;
  ultima date;
begin
  select max(nota), max(fecha) into mejor, ultima
  from public.examenes_finales where usuario_id = u and materia_id = m and nota >= 2;

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
          or new.nota is distinct from old.nota or new.fecha is distinct from old.fecha) then
    perform public.recalcular_final(new.usuario_id, new.materia_id);
  end if;
  return null;
end;
$$;

drop trigger if exists examenes_finales_sincronizar on public.examenes_finales;
create trigger examenes_finales_sincronizar
  after insert or update or delete on public.examenes_finales
  for each row execute function public.sincronizar_final();
