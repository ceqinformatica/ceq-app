-- Admins por correo: si un correo está en esta lista, su perfil nace con
-- rol 'admin' la primera vez que entra a la app (Google o correo).
-- La lista no la puede leer ni editar nadie desde la app: se carga desde
-- el SQL Editor, por ejemplo:
--   insert into public.admins_por_correo (email) values ('cuenta@ejemplo.com');
create table if not exists public.admins_por_correo (
  email text primary key check (email = lower(email))
);
alter table public.admins_por_correo enable row level security;
revoke all on public.admins_por_correo from anon, authenticated;

create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, avatar_url, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    case when exists (select 1 from public.admins_por_correo a where a.email = lower(new.email))
         then 'admin'::public.rol_usuario else 'estudiante'::public.rol_usuario end
  );
  return new;
end;
$$;

-- Si el usuario ya existía antes de agregarlo a la lista.
update public.perfiles p set rol = 'admin'
from auth.users u, public.admins_por_correo a
where u.id = p.id and lower(u.email) = a.email and p.rol <> 'admin';
