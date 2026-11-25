-- Finales rediseñados (pedido de Josie, 2026-11-25): al registrar el
-- resultado de una mesa se puede marcar "Rendí y espero la nota" o
-- "Estuve ausente", además de la nota.
--  * 'pendiente': rindió el final y todavía no sabe la nota. El llamado
--    queda usado (cuenta entre los 3 de la materia) pero no tiene nota ni
--    cuenta para los promedios hasta completarla.
--  * 'ausente': estaba en la mesa y no se presentó. Queda en el historial,
--    no es aplazo y no gasta uno de los 3 finales.
-- Igual que el Recu y la Regu, ninguno de los dos lleva nota ni porcentaje.
-- Se puede ejecutar más de una vez.
alter table public.examenes_finales
  drop constraint if exists examenes_finales_tipo_check;
alter table public.examenes_finales
  add constraint examenes_finales_tipo_check
  check (tipo in ('final', 'regularizacion', 'recuperatorio', 'pendiente', 'ausente'));

-- (La regla de la nota ya pide nota solo en 'final' y nada en los demás.)
alter table public.examenes_finales
  drop constraint if exists examenes_finales_nota_segun_tipo;
alter table public.examenes_finales
  add constraint examenes_finales_nota_segun_tipo
  check ((tipo = 'final' and nota is not null) or (tipo <> 'final' and nota is null and porcentaje is null));

-- Pendiente y ausente pueden ir en cualquiera de los 3 llamados.
alter table public.examenes_finales
  drop constraint if exists examenes_finales_llamado_segun_tipo;
alter table public.examenes_finales
  add constraint examenes_finales_llamado_segun_tipo
  check (tipo in ('final', 'pendiente', 'ausente') or llamado is null
         or (tipo = 'recuperatorio' and llamado = 1)
         or (tipo = 'regularizacion' and llamado in (1, 2)));
