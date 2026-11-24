-- Vencimiento del carnet según lo impreso en cada carnet.
--
-- Hay varios diseños de carnet del CEQ vigentes, con duraciones
-- distintas: ya no se exige que venza dentro de 3 años. Vale la fecha
-- que figura en el carnet (la app la lee de la foto y el CEQ la confirma
-- mirándola); solo se rechaza lo imposible, más de 6 años desde hoy.
-- Se puede ejecutar más de una vez sin romper nada.

create or replace function public.solicitar_carnet(
  p_nombre text, p_ci text, p_numero text, p_vence date, p_foto text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  hoy date := (now() at time zone 'America/Asuncion')::date;
  v_ci text := regexp_replace(coalesce(p_ci, ''), '[^0-9A-Za-z]', '', 'g');
  nueva uuid;
begin
  if uid is null then raise exception 'Iniciá sesión para validar tu carnet'; end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 then raise exception 'Escribí tu nombre completo'; end if;
  if length(v_ci) < 4 or length(v_ci) > 12 then raise exception 'Revisá tu número de cédula'; end if;
  if p_foto is null or split_part(p_foto, '/', 1) <> uid::text then raise exception 'Falta la foto del carnet'; end if;
  if p_vence is null then raise exception 'Elegí la fecha de vencimiento del carnet'; end if;
  if p_vence < hoy then
    raise exception 'Tu carnet está vencido. Renovalo en la sede del CEQ para tener el carnet digital';
  end if;
  if p_vence > (hoy + interval '6 years')::date then
    raise exception 'Ese vencimiento no parece correcto. Revisá la fecha que figura en tu carnet';
  end if;
  if exists (select 1 from public.socios s where s.usuario_id = uid and s.activo
             and (s.vigente_hasta is null or s.vigente_hasta >= hoy)) then
    raise exception 'Ya tenés tu carnet digital habilitado';
  end if;
  if exists (select 1 from public.socios s where (s.usuario_id = uid or s.ci = v_ci) and not s.activo) then
    raise exception 'Tu carnet fue dado de baja por el CEQ. Consultá en la sede';
  end if;

  update public.solicitudes_carnet
     set nombre = btrim(p_nombre), ci = v_ci, numero_socio = nullif(btrim(coalesce(p_numero, '')), ''),
         vigente_hasta = p_vence, foto_path = p_foto, created_at = now()
   where usuario_id = uid and estado = 'pendiente'
  returning id into nueva;
  if nueva is null then
    insert into public.solicitudes_carnet (usuario_id, nombre, ci, numero_socio, vigente_hasta, foto_path)
    values (uid, btrim(p_nombre), v_ci, nullif(btrim(coalesce(p_numero, '')), ''), p_vence, p_foto)
    returning id into nueva;
  end if;
  return nueva;
end $$;
revoke all on function public.solicitar_carnet(text, text, text, date, text) from public, anon;
grant execute on function public.solicitar_carnet(text, text, text, date, text) to authenticated;
