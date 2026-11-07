-- ===== Pagos: efectivo / transferencia con comprobante =====
-- Aplicada en Supabase (proyecto chxewldeqeqjlchumgse). Se guarda acá como registro.

-- 1) Columnas nuevas en pedidos
alter table public.pedidos
  add column medio_pago text not null default 'efectivo'
    check (medio_pago in ('efectivo', 'transferencia')),
  -- no_aplica: efectivo · pendiente: falta comprobante · enviado: comprobante para revisar · confirmado: el local lo verificó
  add column pago_estado text not null default 'no_aplica'
    check (pago_estado in ('no_aplica', 'pendiente', 'enviado', 'confirmado')),
  add column comprobante_path text,
  add column paga_con integer check (paga_con is null or paga_con > 0); -- efectivo: billete para el vuelto

-- 2) Bloqueo: una transferencia sin pago confirmado no avanza de "recibido" (solo se puede cancelar)
create or replace function public.pedidos_validar_pago()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.medio_pago = 'transferencia'
     and new.pago_estado <> 'confirmado'
     and new.estado is distinct from old.estado
     and new.estado not in ('recibido', 'cancelado') then
    raise exception 'pago no confirmado';
  end if;
  return new;
end $$;

create trigger pedidos_validar_pago
  before update on public.pedidos
  for each row execute function public.pedidos_validar_pago();

-- 3) crear_pedido con medio de pago (los parámetros nuevos tienen default: el front viejo sigue andando)
drop function public.crear_pedido(text, text, text, text, text, jsonb);

create function public.crear_pedido(
  p_nombre text, p_telefono text, p_tipo_entrega text, p_direccion text, p_aclaraciones text,
  p_items jsonb, p_medio_pago text default 'efectivo', p_paga_con integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefono,''), '\D', '', 'g');
  v_items jsonb := '[]'::jsonb;
  v_total int := 0;
  it jsonb; p record; v_cant int; v_papas boolean; v_precio int; v_row public.pedidos;
begin
  if (select valor from public.configuracion where clave='recibiendo_pedidos') = 'false' then
    raise exception 'no se reciben pedidos por ahora';
  end if;
  if coalesce(trim(p_nombre),'') = '' or length(v_tel) < 8 then
    raise exception 'datos del cliente invalidos';
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

-- 4) consultar_pedido devuelve también el medio y el estado del pago (nunca el comprobante)
create or replace function public.consultar_pedido(p_codigo text default null, p_numero integer default null, p_tel4 text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'numero', p.numero,
    'codigo', 'BH-' || lpad(p.numero::text, 4, '0'),
    'codigo_publico', p.codigo_publico,
    'estado', p.estado,
    'tipo_entrega', p.tipo_entrega,
    'hora_estimada', p.hora_estimada,
    'total', p.total,
    'medio_pago', p.medio_pago,
    'pago_estado', p.pago_estado,
    'created_at', p.created_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'nombre', i->>'nombre', 'cantidad', (i->>'cantidad')::int,
        'subtotal', (i->>'subtotal')::int))
        from jsonb_array_elements(p.items) i), '[]'::jsonb),
    'historial', coalesce((select jsonb_agg(jsonb_build_object(
        'estado', e.estado, 'at', e.created_at) order by e.created_at)
        from public.pedido_estados e where e.pedido_id = p.id), '[]'::jsonb))
  from public.pedidos p
  where (p_codigo is not null and p.codigo_publico = lower(trim(p_codigo)))
     or (p_numero is not null and p_tel4 ~ '^\d{4}$' and p.numero = p_numero
         and right(p.telefono, 4) = p_tel4)
  limit 1;
$$;

-- 5) Bucket privado para comprobantes (5 MB, imágenes o PDF)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

-- ¿Se puede subir un comprobante a esta ruta? Solo a la carpeta {codigo_publico}/ de un pedido
-- por transferencia que todavía espera el pago y no terminó.
create or replace function public.puede_subir_comprobante(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pedidos p
    where p.codigo_publico = split_part(p_ruta, '/', 1)
      and p.medio_pago = 'transferencia'
      and p.pago_estado in ('pendiente', 'enviado')
      and p.estado not in ('entregado', 'cancelado'));
$$;
revoke all on function public.puede_subir_comprobante(text) from public;
grant execute on function public.puede_subir_comprobante(text) to anon, authenticated;

-- El cliente (anónimo) solo puede SUBIR (no leer, listar, pisar ni borrar)
create policy "cliente sube comprobante" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'comprobantes' and public.puede_subir_comprobante(name));

-- El admin ve y borra comprobantes
create policy "admin lee comprobantes" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes' and public.es_admin());

create policy "admin borra comprobantes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'comprobantes' and public.es_admin());

-- 6) Asociar el archivo subido al pedido: pasa a "comprobante para revisar"
create or replace function public.adjuntar_comprobante(p_codigo text, p_ruta text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_codigo text := lower(trim(p_codigo));
begin
  if split_part(p_ruta, '/', 1) <> v_codigo
     or not exists (select 1 from storage.objects o where o.bucket_id = 'comprobantes' and o.name = p_ruta) then
    raise exception 'comprobante invalido';
  end if;
  update public.pedidos
     set comprobante_path = p_ruta, pago_estado = 'enviado'
   where codigo_publico = v_codigo
     and medio_pago = 'transferencia'
     and pago_estado in ('pendiente', 'enviado')
     and estado not in ('entregado', 'cancelado');
  if not found then raise exception 'el pedido no acepta comprobante'; end if;
  return jsonb_build_object('pago_estado', 'enviado');
end $$;
revoke all on function public.adjuntar_comprobante(text, text) from public;
grant execute on function public.adjuntar_comprobante(text, text) to anon, authenticated;

-- 7) Datos para transferir (públicos: se muestran en el carrito y en el seguimiento)
insert into public.configuracion (clave, valor) values
  ('alias_transferencia', 'nicolas.escudero.dev'),
  ('cbu_transferencia', ''),
  ('titular_transferencia', ''),
  ('banco_transferencia', '')
on conflict (clave) do nothing;
