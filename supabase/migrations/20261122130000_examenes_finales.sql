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

-- Mantiene materias_estudiante al día con el mejor intento aprobado.
-- Corre con los permisos de quien carga el intento (RLS incluido).
create or replace function public.sincronizar_final()
returns trigger language plpgsql set search_path = public as $$
declare
  u uuid := coalesce(new.usuario_id, old.usuario_id);
  m uuid := coalesce(new.materia_id, old.materia_id);
  mejor smallint;
  ultima date;
begin
  select max(nota), max(fecha) filter (where nota >= 2) into mejor, ultima
  from public.examenes_finales where usuario_id = u and materia_id = m and nota >= 2;

  if mejor is not null then
    insert into public.materias_estudiante (usuario_id, materia_id, estado, nota_final, fecha)
    values (u, m, 'aprobada', mejor, ultima)
    on conflict (usuario_id, materia_id)
    do update set estado = 'aprobada', nota_final = excluded.nota_final,
                  fecha = coalesce(excluded.fecha, public.materias_estudiante.fecha);
  elsif tg_op <> 'INSERT' then
    -- Se borró o corrigió el único intento aprobado: la materia vuelve a firmada.
    update public.materias_estudiante set estado = 'firmada', nota_final = null
    where usuario_id = u and materia_id = m and estado = 'aprobada';
  end if;
  return null;
end;
$$;

drop trigger if exists examenes_finales_sincronizar on public.examenes_finales;
create trigger examenes_finales_sincronizar
  after insert or update or delete on public.examenes_finales
  for each row execute function public.sincronizar_final();
