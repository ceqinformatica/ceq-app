-- =============================================================
-- App CEQ: ajustes de seguridad y rendimiento sobre el esquema inicial
-- Se ejecuta una vez en el SQL Editor del proyecto ceq-app, después
-- de 20261122000000_esquema_inicial.sql. Se puede volver a ejecutar
-- sin romper nada. No toca ningún otro proyecto de Supabase.
-- =============================================================

begin;

-- 1. search_path fijo en la función de los triggers updated_at
--    (lo marca el asesor de seguridad de Supabase).
alter function public.set_updated_at() set search_path = public;

-- 2. Un estudiante no puede crear una sugerencia ya "respondida" ni
--    escribir él mismo la respuesta del CEQ.
drop policy if exists "crear sugerencia" on public.sugerencias;
create policy "crear sugerencia" on public.sugerencias for insert to authenticated
  with check (usuario_id = (select auth.uid()) and estado = 'recibida' and respuesta is null);

-- 3. Los eventos que crea un estudiante quedan a su nombre por defecto.
--    Sin esto, un insert sin usuario_id era un "evento oficial" y la
--    política lo rechazaba. El admin crea oficiales con usuario_id = null.
alter table public.eventos alter column usuario_id set default auth.uid();

-- 4. Permisos de más que Supabase da por defecto: TRUNCATE no respeta
--    RLS, así que se le saca a los roles de la app.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- 5. Rendimiento: (select auth.uid()) y (select es_admin()) se evalúan
--    una sola vez por consulta y no una vez por fila (recomendación del
--    asesor de rendimiento de Supabase). Las reglas son las mismas.
do $$
declare t text;
begin
  foreach t in array array['carreras','planes','grupos_optativas','materias','prerrequisitos','reglas_firma','tramites','encuestas','opciones_encuesta']
  loop
    execute format('drop policy if exists "admin edita %1$s" on public.%1$I', t);
    -- Solo escritura: la lectura ya la cubre "leer %1$s".
    execute format('drop policy if exists "admin crea %1$s" on public.%1$I', t);
    execute format('create policy "admin crea %1$s" on public.%1$I for insert to authenticated with check ((select public.es_admin()))', t);
    execute format('drop policy if exists "admin modifica %1$s" on public.%1$I', t);
    execute format('create policy "admin modifica %1$s" on public.%1$I for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()))', t);
    execute format('drop policy if exists "admin borra %1$s" on public.%1$I', t);
    execute format('create policy "admin borra %1$s" on public.%1$I for delete to authenticated using ((select public.es_admin()))', t);
  end loop;

  foreach t in array array['materias_estudiante','evaluaciones','asistencias','horario','dispositivos']
  loop
    execute format('drop policy if exists "dueño %1$s" on public.%1$I', t);
    execute format('create policy "dueño %1$s" on public.%1$I for all to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()))', t);
  end loop;
end $$;

drop policy if exists "ver mi perfil" on public.perfiles;
create policy "ver mi perfil" on public.perfiles for select to authenticated
  using (id = (select auth.uid()) or (select public.es_admin()));
drop policy if exists "editar mi perfil" on public.perfiles;
create policy "editar mi perfil" on public.perfiles for update to authenticated
  using (id = (select auth.uid()) or (select public.es_admin()))
  with check (id = (select auth.uid()) or (select public.es_admin()));

drop policy if exists "ver eventos" on public.eventos;
create policy "ver eventos" on public.eventos for select to authenticated
  using (usuario_id = (select auth.uid()) or usuario_id is null);
drop policy if exists "crear mis eventos" on public.eventos;
create policy "crear mis eventos" on public.eventos for insert to authenticated
  with check (usuario_id = (select auth.uid()) or (usuario_id is null and (select public.es_admin())));
drop policy if exists "editar mis eventos" on public.eventos;
create policy "editar mis eventos" on public.eventos for update to authenticated
  using (usuario_id = (select auth.uid()) or (usuario_id is null and (select public.es_admin())))
  with check (usuario_id = (select auth.uid()) or (usuario_id is null and (select public.es_admin())));
drop policy if exists "borrar mis eventos" on public.eventos;
create policy "borrar mis eventos" on public.eventos for delete to authenticated
  using (usuario_id = (select auth.uid()) or (usuario_id is null and (select public.es_admin())));

-- Socios y avisos: igual que antes, pero el "admin edita" ya no se
-- superpone con la política de lectura.
drop policy if exists "ver socios" on public.socios;
create policy "ver socios" on public.socios for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_validador()));
drop policy if exists "admin edita socios" on public.socios;
drop policy if exists "admin crea socios" on public.socios;
create policy "admin crea socios" on public.socios for insert to authenticated with check ((select public.es_admin()));
drop policy if exists "admin modifica socios" on public.socios;
create policy "admin modifica socios" on public.socios for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
drop policy if exists "admin borra socios" on public.socios;
create policy "admin borra socios" on public.socios for delete to authenticated using ((select public.es_admin()));

drop policy if exists "leer avisos" on public.avisos;
create policy "leer avisos" on public.avisos for select to authenticated
  using (publicado or (select public.es_admin()));
drop policy if exists "admin edita avisos" on public.avisos;
drop policy if exists "admin crea avisos" on public.avisos;
create policy "admin crea avisos" on public.avisos for insert to authenticated with check ((select public.es_admin()));
drop policy if exists "admin modifica avisos" on public.avisos;
create policy "admin modifica avisos" on public.avisos for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
drop policy if exists "admin borra avisos" on public.avisos;
create policy "admin borra avisos" on public.avisos for delete to authenticated using ((select public.es_admin()));

drop policy if exists "ver sugerencias" on public.sugerencias;
create policy "ver sugerencias" on public.sugerencias for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_admin()));
drop policy if exists "admin responde" on public.sugerencias;
create policy "admin responde" on public.sugerencias for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists "ver si ya voté" on public.ya_votaron;
create policy "ver si ya voté" on public.ya_votaron for select to authenticated
  using (usuario_id = (select auth.uid()));

commit;
