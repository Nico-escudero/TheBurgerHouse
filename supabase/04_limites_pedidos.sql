-- ===== Límites a la creación de pedidos (auditoría de seguridad, run-1) =====
-- Problema: crear_pedido es anónimo y no tenía límite. Se podían crear pedidos falsos sin parar
-- (llenan el panel y suenan) y los que quedaban en "recibido" no se limpiaban nunca.
-- Arreglo:
--   1. Máximo 3 pedidos por teléfono cada 15 minutos y 40 pedidos en total cada 10 minutos.
--   2. "recibiendo_pedidos" falla cerrado: si falta la fila, no se reciben pedidos.
--   3. La limpieza diaria cancela los pedidos que siguen en "recibido" después de 6 horas
--      (y 2 días después se borran como cualquier cancelado).
-- Los números (3/15 min, 40/10 min, 6 h) se pueden ajustar acá.

-- 1) crear_pedido: misma firma y lógica, con los límites al principio
create or replace function public.crear_pedido(
  p_nombre text, p_telefono text, p_tipo_entrega text, p_direccion text, p_aclaraciones text,
  p_items jsonb, p_medio_pago text default 'efectivo', p_paga_con integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefono,''), '\D', '', 'g');
  v_items jsonb := '[]'::jsonb;
  v_total int := 0;
  it jsonb; p record; v_cant int; v_papas boolean; v_precio int; v_row public.pedidos;
begin
  if coalesce((select valor from public.configuracion where clave='recibiendo_pedidos'), 'false') <> 'true' then
    raise exception 'no se reciben pedidos por ahora';
  end if;
  if coalesce(trim(p_nombre),'') = '' or length(v_tel) not between 8 and 15 then
    raise exception 'datos del cliente invalidos';
  end if;
  if (select count(*) from public.pedidos
       where telefono = v_tel and created_at > now() - interval '15 minutes') >= 3 then
    raise exception 'demasiados pedidos seguidos, esperá unos minutos o escribinos por WhatsApp';
  end if;
  if (select count(*) from public.pedidos where created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'estamos con muchos pedidos, probá en unos minutos o escribinos por WhatsApp';
  end if;
  if p_tipo_entrega not in ('retiro','envio') then raise exception 'tipo invalido'; end if;
  if p_tipo_entrega = 'envio' and coalesce(trim(p_direccion),'') = '' then
    raise exception 'falta direccion';
  end if;
  if coalesce(p_medio_pago,'') not in ('efectivo','transferencia') then
    raise exception 'medio de pago invalido';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 40 then
    raise exception 'items invalidos';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::int;
    if v_cant is null or v_cant not between 1 and 50 then raise exception 'cantidad invalida'; end if;
    v_papas := coalesce((it->>'con_papas')::boolean, false);

    select id, nombre, precio, precio_con_papas into p
    from public.productos
    where id = (it->>'producto_id')::uuid and activo and stock;
    if not found then raise exception 'producto no disponible'; end if;

    v_precio := case when v_papas and p.precio_con_papas is not null
                     then p.precio_con_papas else p.precio end;
    v_items := v_items || jsonb_build_object(
      'producto_id', p.id, 'nombre', p.nombre, 'cantidad', v_cant,
      'con_papas', v_papas, 'precio_unitario', v_precio, 'subtotal', v_precio * v_cant);
    v_total := v_total + v_precio * v_cant;
  end loop;

  insert into public.pedidos (nombre, telefono, tipo_entrega, direccion, aclaraciones, items, total,
                              medio_pago, pago_estado, paga_con)
  values (left(trim(p_nombre),80), v_tel, p_tipo_entrega,
          left(p_direccion,200), left(p_aclaraciones,300), v_items, v_total,
          p_medio_pago,
          case when p_medio_pago = 'transferencia' then 'pendiente' else 'no_aplica' end,
          case when p_medio_pago = 'efectivo' and p_paga_con > 0 then least(p_paga_con, 10000000) end)
  returning * into v_row;

  return jsonb_build_object(
    'numero', v_row.numero,
    'codigo', 'BH-' || lpad(v_row.numero::text, 4, '0'),
    'codigo_publico', v_row.codigo_publico,
    'total', v_row.total,
    'medio_pago', v_row.medio_pago);
end $$;
revoke all on function public.crear_pedido(text, text, text, text, text, jsonb, text, integer) from public;
grant execute on function public.crear_pedido(text, text, text, text, text, jsonb, text, integer) to anon, authenticated;

-- 2) limpiar_pedidos: antes de borrar, cancela los "recibido" abandonados (más de 6 horas)
create or replace function public.limpiar_pedidos()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.pedidos set estado = 'cancelado'
   where estado = 'recibido' and created_at < now() - interval '6 hours';

  with viejos as (
    select * from public.pedidos
    where estado in ('entregado', 'cancelado') and created_at < now() - interval '2 days'
  ), por_dia as (
    select (created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
           count(*) filter (where estado <> 'cancelado') as pedidos,
           count(*) filter (where estado = 'cancelado') as cancelados,
           coalesce(sum(total) filter (where estado <> 'cancelado'), 0) as total,
           coalesce(sum(total) filter (where estado <> 'cancelado' and medio_pago = 'efectivo'), 0) as efectivo,
           coalesce(sum(total) filter (where estado <> 'cancelado' and medio_pago = 'transferencia'), 0) as transferencia
    from viejos group by 1
  ), resumen as (
    insert into public.resumen_diario as r (fecha, pedidos, cancelados, total, efectivo, transferencia)
    select fecha, pedidos, cancelados, total, efectivo, transferencia from por_dia
    on conflict (fecha) do update set
      pedidos = r.pedidos + excluded.pedidos,
      cancelados = r.cancelados + excluded.cancelados,
      total = r.total + excluded.total,
      efectivo = r.efectivo + excluded.efectivo,
      transferencia = r.transferencia + excluded.transferencia,
      actualizado = now()
  )
  delete from public.pedidos p using viejos v where p.id = v.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.limpiar_pedidos() from public, anon, authenticated;
grant execute on function public.limpiar_pedidos() to service_role;
