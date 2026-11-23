/**
 * Genera la migración del calendario académico a partir de
 * src/datos/calendario-fcq.ts. Uso:
 *   node scripts/seed-calendario.ts > supabase/migrations/20261123120000_calendario_academico.sql
 */
import { pathToFileURL } from 'node:url';
import { CALENDARIO_FCQ_2026, FUENTE_CALENDARIO } from '../src/datos/calendario-fcq.ts';
import { CATEGORIAS_CALENDARIO } from '../src/lib/calendario.ts';

const q = (v: string | number | null | undefined) => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

export function sqlCalendario(): string {
  const filas = CALENDARIO_FCQ_2026.map((f) =>
    `  (${q(f.clave)}, ${f.anio}, ${q(f.semestre)}, ${q(f.categoria)}, ${q(f.titulo)}, ${q(f.desde)}, ${q(f.hasta)}, ${q(f.detalle ?? null)})`,
  ).join(',\n');
  return `-- =============================================================
-- App CEQ: calendario académico oficial de la FCQ
--  * tabla calendario_academico: inscripciones, clases, finales,
--    vencimientos de aranceles, plazos de solicitudes, feriados y asuetos
--  * todos los estudiantes con sesión lo leen; solo el admin lo edita
--  * carga inicial: calendario 2026 (Res. 9048/2025) de
--    ${FUENTE_CALENDARIO} (23/11/2026)
-- Se ejecuta una vez en el SQL Editor del proyecto ceq-app. Se puede
-- volver a ejecutar: no duplica ni pisa filas editadas en el panel.
-- ARCHIVO GENERADO por scripts/seed-calendario.ts: editá los datos en
-- src/datos/calendario-fcq.ts y volvé a correr el script.
-- =============================================================

create table if not exists public.calendario_academico (
  id          uuid primary key default gen_random_uuid(),
  clave       text unique,
  anio        integer not null check (anio between 2000 and 2100),
  semestre    smallint check (semestre in (1, 2)),
  categoria   text not null check (categoria in (${CATEGORIAS_CALENDARIO.map((c) => q(c)).join(', ')})),
  titulo      text not null check (length(btrim(titulo)) between 3 and 160),
  desde       date not null,
  hasta       date not null,
  detalle     text check (detalle is null or length(detalle) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint calendario_rango check (hasta >= desde)
);
create index if not exists calendario_academico_fechas on public.calendario_academico (hasta, desde);

alter table public.calendario_academico enable row level security;

drop policy if exists "ver calendario" on public.calendario_academico;
create policy "ver calendario" on public.calendario_academico for select to authenticated using (true);
drop policy if exists "admin crea calendario" on public.calendario_academico;
create policy "admin crea calendario" on public.calendario_academico for insert to authenticated
  with check ((select public.es_admin()));
drop policy if exists "admin edita calendario" on public.calendario_academico;
create policy "admin edita calendario" on public.calendario_academico for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
drop policy if exists "admin borra calendario" on public.calendario_academico;
create policy "admin borra calendario" on public.calendario_academico for delete to authenticated
  using ((select public.es_admin()));

revoke all on public.calendario_academico from anon;
grant select, insert, update, delete on public.calendario_academico to authenticated;

-- Carga inicial. Lo que el admin borró no vuelve (se recuerda la clave).
create table if not exists public.calendario_claves_borradas (clave text primary key);
alter table public.calendario_claves_borradas enable row level security;
revoke all on public.calendario_claves_borradas from anon, authenticated;

create or replace function public.calendario_recordar_borrado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.clave is not null then
    insert into public.calendario_claves_borradas (clave) values (old.clave) on conflict do nothing;
  end if;
  return old;
end $$;
revoke execute on function public.calendario_recordar_borrado() from public, anon, authenticated;
drop trigger if exists calendario_recordar_borrado on public.calendario_academico;
create trigger calendario_recordar_borrado after delete on public.calendario_academico
  for each row execute function public.calendario_recordar_borrado();

insert into public.calendario_academico (clave, anio, semestre, categoria, titulo, desde, hasta, detalle)
select v.clave, v.anio, v.semestre, v.categoria, v.titulo, v.desde::date, v.hasta::date, v.detalle
from (values
${filas}
) as v (clave, anio, semestre, categoria, titulo, desde, hasta, detalle)
where not exists (select 1 from public.calendario_claves_borradas b where b.clave = v.clave)
on conflict (clave) do nothing;
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.stdout.write(sqlCalendario());
