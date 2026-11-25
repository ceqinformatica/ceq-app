-- =============================================================
-- App CEQ: el aviso a los estudiantes se guarda aparte de la publicación
--  * Antes, publicar con el interruptor "Avisar" apagado igual dejaba
--    publicado_en y la app mostraba "Ya se avisó", sin poder avisar después.
--  * Ahora avisado_en guarda cuándo salió el aviso: se avisa una sola vez,
--    pero se puede avisar en una publicación posterior si la primera fue sin
--    aviso.
-- Se puede volver a ejecutar sin problema.
-- =============================================================

alter table public.horarios_clases add column if not exists avisado_en timestamptz;
alter table public.horarios_finales add column if not exists avisado_en timestamptz;

-- Los ya publicados: avisados solo si existe la notificación que se mandó.
update public.horarios_clases h set avisado_en = h.publicado_en
where h.publicado_en is not null and h.avisado_en is null
  and exists (select 1 from public.notificaciones n
              where n.carrera_id = h.carrera_id and n.titulo = 'Salió el horario de clases'
                and position('(' || btrim(h.titulo) || ')' in n.cuerpo) > 0);
update public.horarios_finales h set avisado_en = h.publicado_en
where h.publicado_en is not null and h.avisado_en is null
  and exists (select 1 from public.notificaciones n
              where n.carrera_id = h.carrera_id and n.titulo = 'Salieron las fechas de finales'
                and position('(' || btrim(h.titulo) || ')' in n.cuerpo) > 0);

create or replace function public.publicar_horario_clases(p_id uuid, p_notificar boolean default true)
returns integer language plpgsql security definer set search_path = public as $$
declare
  h public.horarios_clases;
  n integer;
  carrera text;
begin
  if not public.es_admin() then raise exception 'Solo para administradores'; end if;
  select * into h from public.horarios_clases where id = p_id for update;
  if not found then raise exception 'Ese horario ya no existe'; end if;
  select count(*) into n from public.clases_oficiales where horario_id = p_id;
  if n = 0 then raise exception 'El horario no tiene clases: agregá al menos una antes de publicarlo'; end if;
  if h.publicado then return n; end if;

  update public.horarios_clases set publicado = true, publicado_en = coalesce(publicado_en, now()) where id = p_id;
  if p_notificar and h.avisado_en is null then
    select coalesce(c.sigla, c.nombre) into carrera from public.carreras c where c.id = h.carrera_id;
    insert into public.notificaciones (tipo, titulo, cuerpo, ruta, carrera_id, programada_para)
    values ('mensaje', 'Salió el horario de clases',
            left('Ya está el horario de clases de ' || coalesce(carrera, 'tu carrera') || ' (' || btrim(h.titulo) || '). Cargá tus clases a la agenda con un toque.', 500),
            '/agenda', h.carrera_id, now());
    update public.horarios_clases set avisado_en = now() where id = p_id;
  end if;
  return n;
end;
$$;
revoke all on function public.publicar_horario_clases(uuid, boolean) from public, anon;
grant execute on function public.publicar_horario_clases(uuid, boolean) to authenticated;

create or replace function public.publicar_horario_finales(p_id uuid, p_notificar boolean default true)
returns integer language plpgsql security definer set search_path = public as $$
declare
  h public.horarios_finales;
  n integer;
  carrera text;
begin
  if not public.es_admin() then raise exception 'Solo para administradores'; end if;
  select * into h from public.horarios_finales where id = p_id for update;
  if not found then raise exception 'Ese horario ya no existe'; end if;
  select count(*) into n from public.fechas_finales where horario_id = p_id;
  if n = 0 then raise exception 'El horario no tiene fechas: agregá al menos una antes de publicarlo'; end if;
  if h.publicado then return n; end if;

  update public.horarios_finales set publicado = true, publicado_en = coalesce(publicado_en, now()) where id = p_id;
  if p_notificar and h.avisado_en is null then
    select coalesce(c.sigla, c.nombre) into carrera from public.carreras c where c.id = h.carrera_id;
    insert into public.notificaciones (tipo, titulo, cuerpo, ruta, carrera_id, programada_para)
    values ('mensaje', 'Salieron las fechas de finales',
            left('Ya está el horario de finales de ' || coalesce(carrera, 'tu carrera') || ' (' || btrim(h.titulo) || '). Mirá cuándo rendís tus materias.', 500),
            '/finales-fechas', h.carrera_id, now());
    update public.horarios_finales set avisado_en = now() where id = p_id;
  end if;
  return n;
end;
$$;
revoke all on function public.publicar_horario_finales(uuid, boolean) from public, anon;
grant execute on function public.publicar_horario_finales(uuid, boolean) to authenticated;
