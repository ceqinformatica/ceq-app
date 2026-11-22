-- =============================================================
-- App CEQ: esquema inicial
-- Proyecto de Supabase propio de la app. No comparte nada con
-- los sistemas de reservas ni de guardias.
-- =============================================================

-- ---------- Tipos ----------
create type public.rol_usuario as enum ('estudiante', 'validador', 'admin');
create type public.estado_materia as enum ('pendiente', 'cursando', 'firmada', 'aprobada');
create type public.componente_eval as enum ('teoria', 'laboratorio');
create type public.tipo_evento as enum ('examen', 'entrega', 'recordatorio');
create type public.requisito_tipo as enum ('firmada', 'aprobada');

-- ---------- Utilidades ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================
-- CATÁLOGO COMPARTIDO (lo edita solo el CEQ)
-- =============================================================

create table public.carreras (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  sigla       text,
  semestres   smallint not null check (semestres between 1 and 20),
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.planes (
  id           uuid primary key default gen_random_uuid(),
  carrera_id   uuid not null references public.carreras(id) on delete cascade,
  nombre       text not null,            -- ej. "Plan 2019"
  anio         smallint,
  vigente      boolean not null default true,
  -- Si el plan mide avance por créditos u horas en vez de por materia.
  unidad_avance text not null default 'materias' check (unidad_avance in ('materias', 'creditos', 'horas')),
  created_at   timestamptz not null default now()
);
create index on public.planes (carrera_id);

create table public.grupos_optativas (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.planes(id) on delete cascade,
  nombre          text not null,          -- ej. "Optativas de 4.º año"
  cantidad_exigida smallint not null default 1 check (cantidad_exigida >= 0)
);
create index on public.grupos_optativas (plan_id);

create table public.materias (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.planes(id) on delete cascade,
  codigo           text,
  nombre           text not null,
  semestre         smallint not null check (semestre between 1 and 20),
  horas            smallint,
  creditos         numeric(5,2),
  tiene_laboratorio boolean not null default false,
  grupo_optativa_id uuid references public.grupos_optativas(id) on delete set null,
  orden            smallint not null default 0
);
create index on public.materias (plan_id, semestre);

-- Una materia es optativa si pertenece a un grupo de optativas.
create or replace view public.materias_con_tipo
with (security_invoker = true) as
  select m.*, (m.grupo_optativa_id is not null) as es_optativa
  from public.materias m;

create table public.prerrequisitos (
  materia_id    uuid not null references public.materias(id) on delete cascade,
  requiere_id   uuid not null references public.materias(id) on delete cascade,
  tipo          public.requisito_tipo not null default 'firmada',
  primary key (materia_id, requiere_id),
  check (materia_id <> requiere_id)
);

-- Reglas de firma. Una general por plan (materia_id nulo) y
-- excepciones por materia. Los porcentajes van de 0 a 100.
create table public.reglas_firma (
  id                    uuid primary key default gen_random_uuid(),
  plan_id               uuid not null references public.planes(id) on delete cascade,
  materia_id            uuid references public.materias(id) on delete cascade,
  minimo_teoria         numeric(5,2) not null default 60 check (minimo_teoria between 0 and 100),
  minimo_laboratorio    numeric(5,2) check (minimo_laboratorio between 0 and 100),
  minimo_asistencia     numeric(5,2) not null default 75 check (minimo_asistencia between 0 and 100),
  minimo_asistencia_lab numeric(5,2) check (minimo_asistencia_lab between 0 and 100),
  -- 'separado': teoría y laboratorio se aprueban cada uno con su mínimo.
  -- 'combinado': el laboratorio pesa peso_laboratorio % dentro de una sola nota.
  modo_laboratorio      text not null default 'separado' check (modo_laboratorio in ('separado', 'combinado')),
  peso_laboratorio      numeric(5,2) check (peso_laboratorio between 0 and 100),
  notas                 text
);
-- Una sola regla general por plan y una por materia.
create unique index reglas_firma_general on public.reglas_firma (plan_id) where materia_id is null;
create unique index reglas_firma_materia on public.reglas_firma (materia_id) where materia_id is not null;

-- =============================================================
-- PERFILES
-- =============================================================

create table public.perfiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre          text,
  ci              text,
  carrera_id      uuid references public.carreras(id) on delete set null,
  plan_id         uuid references public.planes(id) on delete set null,
  anio_ingreso    smallint,
  rol             public.rol_usuario not null default 'estudiante',
  avatar_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger perfiles_updated before update on public.perfiles
  for each row execute function public.set_updated_at();

-- ¿El usuario actual es admin? security definer para que las
-- políticas puedan consultarlo sin recursión.
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin');
$$;

create or replace function public.es_validador()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol in ('admin', 'validador'));
$$;

-- Un estudiante no puede cambiarse el rol a sí mismo. Desde el
-- editor SQL de Supabase (sin sesión de app) sí se puede, para
-- nombrar al primer admin.
create or replace function public.proteger_rol()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.rol is distinct from old.rol
     and current_user in ('authenticated', 'anon')
     and not public.es_admin() then
    raise exception 'Solo un admin puede cambiar roles';
  end if;
  return new;
end;
$$;
create trigger perfiles_proteger_rol before update on public.perfiles
  for each row execute function public.proteger_rol();

-- Crea el perfil al registrarse (Google o correo).
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

-- =============================================================
-- DATOS DE CADA ESTUDIANTE (solo los ve su dueño)
-- =============================================================

create table public.materias_estudiante (
  usuario_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  materia_id   uuid not null references public.materias(id) on delete cascade,
  estado       public.estado_materia not null default 'pendiente',
  nota_final   numeric(4,2),
  fecha        date,
  periodo      text,                      -- ej. "2026-2"
  updated_at   timestamptz not null default now(),
  primary key (usuario_id, materia_id)
);
create trigger materias_estudiante_updated before update on public.materias_estudiante
  for each row execute function public.set_updated_at();

create table public.evaluaciones (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  materia_id      uuid not null references public.materias(id) on delete cascade,
  nombre          text not null,
  componente      public.componente_eval not null default 'teoria',
  ponderacion     numeric(6,2) not null check (ponderacion >= 0),
  -- Se carga porcentaje directo, o puntaje obtenido sobre total.
  porcentaje      numeric(5,2) check (porcentaje between 0 and 100),
  puntaje_obtenido numeric(7,2) check (puntaje_obtenido >= 0),
  puntaje_total    numeric(7,2) check (puntaje_total > 0),
  rendida         boolean not null default true,
  fecha           date,
  orden           smallint not null default 0,
  created_at      timestamptz not null default now()
);
create index on public.evaluaciones (usuario_id, materia_id);

create table public.asistencias (
  usuario_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  materia_id   uuid not null references public.materias(id) on delete cascade,
  componente   public.componente_eval not null default 'teoria',
  clases_dictadas  smallint not null default 0 check (clases_dictadas >= 0),
  clases_asistidas smallint not null default 0 check (clases_asistidas >= 0),
  clases_totales   smallint check (clases_totales >= 0),  -- total previsto del semestre, si se conoce
  primary key (usuario_id, materia_id, componente),
  check (clases_asistidas <= clases_dictadas)
);

create table public.horario (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  materia_id   uuid references public.materias(id) on delete set null,
  titulo       text,
  dia_semana   smallint not null check (dia_semana between 1 and 7),  -- 1 = lunes
  hora_inicio  time not null,
  hora_fin     time not null,
  aula         text,
  check (hora_fin > hora_inicio)
);
create index on public.horario (usuario_id);

create table public.eventos (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid references auth.users(id) on delete cascade,  -- nulo = evento oficial del CEQ
  materia_id     uuid references public.materias(id) on delete set null,
  plan_id        uuid references public.planes(id) on delete cascade, -- a qué plan aplica un evento oficial
  tipo           public.tipo_evento not null default 'examen',
  titulo         text not null,
  fecha          timestamptz not null,
  aviso_minutos  integer not null default 1440,  -- 24 h antes
  notificado     boolean not null default false,
  created_at     timestamptz not null default now()
);
create index on public.eventos (usuario_id, fecha);
create index on public.eventos (fecha) where notificado = false;

-- =============================================================
-- MÓDULOS DEL CEQ
-- =============================================================

create table public.socios (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid unique references auth.users(id) on delete set null,
  numero_socio  text unique,
  ci            text unique not null,
  nombre        text not null,
  vigente_hasta date,
  foto_path     text,           -- ruta en Storage (bucket privado "carnets")
  updated_at    timestamptz not null default now()
);
create trigger socios_updated before update on public.socios
  for each row execute function public.set_updated_at();

create table public.avisos (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  cuerpo       text not null,
  imagen_url   text,
  notificar    boolean not null default true,
  publicado    boolean not null default true,
  autor_id     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.tramites (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  descripcion  text,
  pasos        text[] not null default '{}',
  costo        text,
  donde        text,
  formulario_url text,
  orden        smallint not null default 0
);

create table public.sugerencias (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid references auth.users(id) on delete set null default auth.uid(),
  categoria    text,
  texto        text not null check (length(texto) between 3 and 2000),
  estado       text not null default 'recibida' check (estado in ('recibida', 'en_revision', 'respondida')),
  respuesta    text,
  created_at   timestamptz not null default now()
);

create table public.encuestas (
  id           uuid primary key default gen_random_uuid(),
  pregunta     text not null,
  abierta      boolean not null default true,
  cierra_en    timestamptz,
  created_at   timestamptz not null default now()
);

create table public.opciones_encuesta (
  id           uuid primary key default gen_random_uuid(),
  encuesta_id  uuid not null references public.encuestas(id) on delete cascade,
  texto        text not null,
  orden        smallint not null default 0
);

-- Votos SIN usuario: nadie puede saber quién votó qué.
create table public.votos (
  id           uuid primary key default gen_random_uuid(),
  encuesta_id  uuid not null references public.encuestas(id) on delete cascade,
  opcion_id    uuid not null references public.opciones_encuesta(id) on delete cascade
  -- sin fecha a propósito, para que no se pueda cruzar con "ya_votaron"
);

-- Solo registra QUE alguien votó, para evitar votos dobles.
create table public.ya_votaron (
  encuesta_id  uuid not null references public.encuestas(id) on delete cascade,
  usuario_id   uuid not null references auth.users(id) on delete cascade,
  primary key (encuesta_id, usuario_id)
);

-- Votar pasa por esta función: guarda el voto y la marca en una
-- sola transacción, sin unir el usuario con la opción.
create or replace function public.votar(p_encuesta uuid, p_opcion uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  if not exists (
    select 1 from public.encuestas e
    join public.opciones_encuesta o on o.encuesta_id = e.id
    where e.id = p_encuesta and o.id = p_opcion
      and e.abierta and (e.cierra_en is null or e.cierra_en > now())
  ) then
    raise exception 'La encuesta no está abierta o la opción no es válida';
  end if;
  insert into public.ya_votaron (encuesta_id, usuario_id) values (p_encuesta, auth.uid());
  insert into public.votos (encuesta_id, opcion_id) values (p_encuesta, p_opcion);
exception when unique_violation then
  raise exception 'Ya votaste en esta encuesta';
end;
$$;

create or replace view public.resultados_encuesta
with (security_invoker = false) as
  select o.encuesta_id, o.id as opcion_id, o.texto, count(v.id)::int as votos
  from public.opciones_encuesta o
  left join public.votos v on v.opcion_id = o.id
  group by o.encuesta_id, o.id, o.texto;

create table public.dispositivos (
  token        text primary key,
  usuario_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  plataforma   text,
  updated_at   timestamptz not null default now()
);

-- =============================================================
-- SEGURIDAD POR FILA (RLS)
-- =============================================================

alter table public.carreras            enable row level security;
alter table public.planes              enable row level security;
alter table public.grupos_optativas    enable row level security;
alter table public.materias            enable row level security;
alter table public.prerrequisitos      enable row level security;
alter table public.reglas_firma        enable row level security;
alter table public.perfiles            enable row level security;
alter table public.materias_estudiante enable row level security;
alter table public.evaluaciones        enable row level security;
alter table public.asistencias         enable row level security;
alter table public.horario             enable row level security;
alter table public.eventos             enable row level security;
alter table public.socios              enable row level security;
alter table public.avisos              enable row level security;
alter table public.tramites            enable row level security;
alter table public.sugerencias         enable row level security;
alter table public.encuestas           enable row level security;
alter table public.opciones_encuesta   enable row level security;
alter table public.votos               enable row level security;
alter table public.ya_votaron          enable row level security;
alter table public.dispositivos        enable row level security;

-- Catálogo: lo lee cualquier usuario con sesión, lo edita solo admin.
do $$
declare t text;
begin
  foreach t in array array['carreras','planes','grupos_optativas','materias','prerrequisitos','reglas_firma','tramites','encuestas','opciones_encuesta']
  loop
    execute format('create policy "leer %1$s" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "admin edita %1$s" on public.%1$I for all to authenticated using (public.es_admin()) with check (public.es_admin())', t);
  end loop;
end $$;

-- Datos personales: solo el dueño.
do $$
declare t text;
begin
  foreach t in array array['materias_estudiante','evaluaciones','asistencias','horario','dispositivos']
  loop
    execute format('create policy "dueño %1$s" on public.%1$I for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid())', t);
  end loop;
end $$;

-- Perfiles: cada uno el suyo; admin ve y edita todos.
create policy "ver mi perfil" on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_admin());
create policy "editar mi perfil" on public.perfiles for update to authenticated
  using (id = auth.uid() or public.es_admin()) with check (id = auth.uid() or public.es_admin());

-- Eventos: propios + oficiales; los oficiales los edita el admin.
create policy "ver eventos" on public.eventos for select to authenticated
  using (usuario_id = auth.uid() or usuario_id is null);
create policy "crear mis eventos" on public.eventos for insert to authenticated
  with check (usuario_id = auth.uid() or (usuario_id is null and public.es_admin()));
create policy "editar mis eventos" on public.eventos for update to authenticated
  using (usuario_id = auth.uid() or (usuario_id is null and public.es_admin()))
  with check (usuario_id = auth.uid() or (usuario_id is null and public.es_admin()));
create policy "borrar mis eventos" on public.eventos for delete to authenticated
  using (usuario_id = auth.uid() or (usuario_id is null and public.es_admin()));

-- Socios: cada uno ve su carnet; validador y admin ven todos; edita admin.
create policy "ver socios" on public.socios for select to authenticated
  using (usuario_id = auth.uid() or public.es_validador());
create policy "admin edita socios" on public.socios for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Avisos: todos leen los publicados; admin todo.
create policy "leer avisos" on public.avisos for select to authenticated
  using (publicado or public.es_admin());
create policy "admin edita avisos" on public.avisos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Sugerencias: cada uno ve y crea las suyas; admin ve y responde todas.
create policy "ver sugerencias" on public.sugerencias for select to authenticated
  using (usuario_id = auth.uid() or public.es_admin());
create policy "crear sugerencia" on public.sugerencias for insert to authenticated
  with check (usuario_id = auth.uid());
create policy "admin responde" on public.sugerencias for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Votos y ya_votaron: sin acceso directo; se usa votar() y la vista.
create policy "ver si ya voté" on public.ya_votaron for select to authenticated
  using (usuario_id = auth.uid());

revoke all on public.votos from anon, authenticated;
grant select on public.resultados_encuesta to authenticated;
revoke all on function public.votar(uuid, uuid) from public, anon;
grant execute on function public.votar(uuid, uuid) to authenticated;

-- Nada es visible sin sesión.
revoke all on all tables in schema public from anon;
