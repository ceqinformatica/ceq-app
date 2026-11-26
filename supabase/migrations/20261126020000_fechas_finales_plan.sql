-- Plan y "semestre opuesto" de cada fecha de final.
-- La planilla de la Dirección Académica trae una fila por mesa con su plan
-- ("IQ2018", "IQ2026") y algunas dicen "SEMESTRE OPUESTO". Una mesa que es la
-- misma en dos planes se guarda una sola vez con los dos. Sin plan ('{}') =
-- vale para todos los planes (horarios viejos o PDF que no lo dicen).

alter table public.fechas_finales add column if not exists planes smallint[] not null default '{}';
alter table public.fechas_finales add column if not exists semestre_opuesto boolean not null default false;
alter table public.fechas_finales drop constraint if exists fechas_finales_planes_validos;
alter table public.fechas_finales add constraint fechas_finales_planes_validos
  check (cardinality(planes) <= 6 and array_position(planes, null) is null and 1990 <= all(planes) and 2100 >= all(planes));

-- Igual que antes, más los planes y la marca (opcionales: sin ellos, todos los planes y semestre normal).
create or replace function public.guardar_fechas_finales(p_horario uuid, p_fechas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if not public.es_admin() then raise exception 'Solo para administradores'; end if;
  if not exists (select 1 from public.horarios_finales where id = p_horario) then
    raise exception 'Ese horario ya no existe';
  end if;
  if jsonb_typeof(p_fechas) <> 'array' then raise exception 'Formato de fechas inválido'; end if;
  if jsonb_array_length(p_fechas) > 2000 then raise exception 'Demasiadas fechas en un solo horario'; end if;
  if exists (select 1 from jsonb_array_elements(p_fechas) f
             where f ? 'planes' and jsonb_typeof(f -> 'planes') not in ('array', 'null')) then
    raise exception 'Formato de planes inválido';
  end if;
  delete from public.fechas_finales where horario_id = p_horario;
  insert into public.fechas_finales (horario_id, materia, llamado, fecha, hora, aula, planes, semestre_opuesto)
  select p_horario, btrim(f ->> 'materia'), (f ->> 'llamado')::smallint, (f ->> 'fecha')::date,
         nullif(f ->> 'hora', '')::time, nullif(btrim(coalesce(f ->> 'aula', '')), ''),
         coalesce(array(select distinct x::smallint from jsonb_array_elements_text(
                    case when jsonb_typeof(f -> 'planes') = 'array' then f -> 'planes' else '[]'::jsonb end) x order by 1), '{}'),
         coalesce((f ->> 'semestre_opuesto')::boolean, false)
  from jsonb_array_elements(p_fechas) f;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.guardar_fechas_finales(uuid, jsonb) from public, anon;
grant execute on function public.guardar_fechas_finales(uuid, jsonb) to authenticated;
