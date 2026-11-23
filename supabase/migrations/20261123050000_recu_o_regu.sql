-- Josie (CEQ): en una cursada se usa UNO solo de los dos, nunca ambos.
-- Regularización (Art. 40–41) si faltaste a un parcial: 1.º o 2.º llamado.
-- Recuperatorio (Art. 46) si rendiste todos los parciales y no llegaste a la
-- firma: solo el 1.er llamado.
-- Si ya había más de uno cargado (antes de esta regla), se deja el primero
-- (periodo y llamado más tempranos) y los demás pasan a ser "No rendí".
delete from public.examenes_finales e
 where e.tipo in ('regularizacion', 'recuperatorio')
   and not e.cursada_anterior
   and exists (
     select 1 from public.examenes_finales o
      where o.usuario_id = e.usuario_id
        and o.materia_id = e.materia_id
        and o.tipo in ('regularizacion', 'recuperatorio')
        and not o.cursada_anterior
        and o.id <> e.id
        and (coalesce(o.periodo, ''), coalesce(o.llamado, 9), o.id::text)
          < (coalesce(e.periodo, ''), coalesce(e.llamado, 9), e.id::text));

drop index if exists public.examenes_finales_un_recu_o_regu;
create unique index if not exists examenes_finales_un_recu_o_regu
  on public.examenes_finales (usuario_id, materia_id)
  where tipo in ('regularizacion', 'recuperatorio') and not cursada_anterior;
