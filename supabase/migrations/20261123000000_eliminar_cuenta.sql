-- Borrar mi cuenta desde la app (requisito de Google Play).
-- Borra al usuario de auth.users; todas sus tablas personales tienen
-- "on delete cascade" (perfil, materias, notas, agenda, finales,
-- celulares, notificaciones), y lo anónimo o compartido (sugerencias,
-- votos, avisos que creó un admin) queda con usuario nulo.
-- Solo puede borrarse a sí mismo: no recibe ningún id.
create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := auth.uid();
begin
  if yo is null then
    raise exception 'Tenés que iniciar sesión para borrar tu cuenta.';
  end if;
  delete from auth.users where id = yo;
end $$;

revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;
