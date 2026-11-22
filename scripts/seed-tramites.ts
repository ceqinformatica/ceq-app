/**
 * Regenera la migración de la guía de trámites a partir de
 * src/datos/guia-tramites-fcq.ts. Uso: node scripts/seed-tramites.ts
 */
import { writeFileSync } from 'node:fs';
import { GUIA_TRAMITES_FCQ } from '../src/datos/guia-tramites-fcq.ts';
import { sqlSemilla } from '../src/lib/tramites.ts';

const ENCABEZADO = `-- =============================================================
-- App CEQ: guía de trámites de la FCQ
--  * la tabla tramites suma categoría, requisitos, plazo, contacto,
--    modalidad, enlace a la fuente oficial y "publicado"
--  * los estudiantes solo ven los publicados; el admin ve y edita todos
--  * carga la guía inicial sacada de qui.una.py (22/11/2026)
-- Se ejecuta una vez en el SQL Editor del proyecto ceq-app. Se puede
-- volver a ejecutar: no duplica ni pisa trámites editados en el panel.
-- (Los de la guía inicial no se borran desde el panel, se ocultan: así
-- una nueva ejecución no los vuelve a publicar.)
-- ARCHIVO GENERADO por scripts/seed-tramites.ts: editá los datos en
-- src/datos/guia-tramites-fcq.ts y volvé a correr el script.
-- =============================================================

-- 1. Trámites cargados antes de esta guía (sin clave): se ocultan para
--    que no aparezcan repetidos junto a la guía. El admin los revisa en
--    el panel y los vuelve a publicar o los borra. Solo pasa la primera
--    vez (cuando la columna "clave" todavía no existe).
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'tramites' and column_name = 'clave') then
    alter table public.tramites add column publicado boolean not null default true;
    update public.tramites set publicado = false;
  end if;
end $$;

-- 2. Columnas nuevas.
alter table public.tramites add column if not exists clave text;
alter table public.tramites add column if not exists categoria text not null default 'Otros';
alter table public.tramites add column if not exists requisitos text[] not null default '{}';
alter table public.tramites add column if not exists plazo text;
alter table public.tramites add column if not exists contacto text;
alter table public.tramites add column if not exists modalidad text;
alter table public.tramites add column if not exists fuente_url text;
alter table public.tramites add column if not exists publicado boolean not null default true;
alter table public.tramites add column if not exists updated_at timestamptz not null default now();

-- La clave identifica a los trámites de la guía inicial (los que crea
-- el admin no la tienen). Es lo que evita duplicarlos al re-ejecutar.
create unique index if not exists tramites_clave_key on public.tramites (clave);

-- 3. Reglas de los datos. Antes se limpian los enlaces que no son https
--    de filas viejas, para que no se puedan abrir desde la app.
update public.tramites set formulario_url = null where formulario_url !~* '^https://[^[:space:]]+$';
update public.tramites set fuente_url = null where fuente_url !~* '^https://[^[:space:]]+$';
-- NOT VALID: no revisa filas viejas (por ejemplo, un nombre corto), sí las nuevas.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tramites_modalidad_check' and conrelid = 'public.tramites'::regclass) then
    alter table public.tramites add constraint tramites_modalidad_check
      check (modalidad is null or modalidad in ('presencial', 'etramite', 'mixto')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tramites_enlaces_https' and conrelid = 'public.tramites'::regclass) then
    alter table public.tramites add constraint tramites_enlaces_https
      check ((formulario_url is null or formulario_url ~* '^https://[^[:space:]]+$') and (fuente_url is null or fuente_url ~* '^https://[^[:space:]]+$')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tramites_nombre_largo' and conrelid = 'public.tramites'::regclass) then
    alter table public.tramites add constraint tramites_nombre_largo
      check (length(btrim(nombre)) between 3 and 120 and length(categoria) between 1 and 60) not valid;
  end if;
end $$;

drop trigger if exists tramites_updated on public.tramites;
create trigger tramites_updated before update on public.tramites
  for each row execute function public.set_updated_at();

-- 4. Lectura: los estudiantes ven solo los publicados; el admin, todos.
--    (Crear, modificar y borrar ya son solo del admin.)
drop policy if exists "leer tramites" on public.tramites;
create policy "leer tramites" on public.tramites for select to authenticated
  using (publicado or (select public.es_admin()));

-- 5. Guía inicial.
`;

const sql = ENCABEZADO + sqlSemilla(GUIA_TRAMITES_FCQ) + '\n';
writeFileSync(new URL('../supabase/migrations/20261122190000_guia_tramites.sql', import.meta.url), sql);
console.log(`Listo: ${GUIA_TRAMITES_FCQ.length} trámites.`);
