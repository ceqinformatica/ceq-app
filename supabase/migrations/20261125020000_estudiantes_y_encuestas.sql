-- =============================================================
-- App CEQ: lista de estudiantes en el panel y encuestas privadas
--  * listar_estudiantes(): todas las cuentas registradas, con correo,
--    carrera, plan, socio y último ingreso. Solo para admins (las demás
--    cuentas reciben un error).
--  * encuestas.resultados_publicos: el admin elige si quien vota ve los
--    porcentajes (como hasta ahora) o si los resultados son privados y
--    solo los ve la administración. La vista resultados_encuesta ya no
--    devuelve los votos de una encuesta privada a quien no es admin.
-- Se puede volver a ejecutar sin problema.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Estudiantes registrados
-- ---------------------------------------------------------------
create or replace function public.listar_estudiantes()
returns table (
  id uuid, nombre text, ci text, correo text, carrera text, plan text,
  anio_ingreso smallint, rol text, registrado_en timestamptz,
  ultimo_ingreso timestamptz, socio_vigente boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo admin'; end if;
  return query
    select p.id, p.nombre, p.ci, u.email::text, c.nombre,
           coalesce(pl.nombre, pl.anio::text), p.anio_ingreso, p.rol::text,
           p.created_at, u.last_sign_in_at,
           exists (select 1 from public.socios so
                   where so.usuario_id = p.id
                     and (so.vigente_hasta is null or so.vigente_hasta >= current_date))
    from public.perfiles p
    join auth.users u on u.id = p.id
    left join public.carreras c on c.id = p.carrera_id
    left join public.planes pl on pl.id = p.plan_id
    order by p.created_at desc
    limit 5000;
end $$;
revoke all on function public.listar_estudiantes() from public, anon;
grant execute on function public.listar_estudiantes() to authenticated;

-- ---------------------------------------------------------------
-- 2. Encuestas con resultados públicos o privados
-- ---------------------------------------------------------------
alter table public.encuestas add column if not exists resultados_publicos boolean not null default true;
comment on column public.encuestas.resultados_publicos is
  'true: quien vota ve los porcentajes. false: solo la administración ve los resultados';

-- La vista corre con permisos de su dueño (los votos no tienen RLS para
-- estudiantes), así que el filtro va adentro.
create or replace view public.resultados_encuesta
with (security_invoker = false) as
  select o.encuesta_id, o.id as opcion_id, o.texto, count(v.id)::int as votos
  from public.opciones_encuesta o
  join public.encuestas e on e.id = o.encuesta_id
  left join public.votos v on v.opcion_id = o.id
  where e.resultados_publicos or public.es_admin()
  group by o.encuesta_id, o.id, o.texto;
revoke all on public.resultados_encuesta from public, anon;
grant select on public.resultados_encuesta to authenticated;
