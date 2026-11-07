-- ===== Seguimiento y comprobantes más seguros (auditoría de seguridad, run-1) =====
-- Problema: el número de pedido es correlativo y los últimos 4 del teléfono son solo 10.000 opciones.
-- Buscando por número + tel4 se obtenía el codigo_publico, que es la llave para subir comprobantes:
-- un tercero podía subir o pisar el comprobante de otro cliente.
-- Arreglo:
--   1. La búsqueda por número + tel4 ya NO devuelve codigo_publico (solo el link del WhatsApp lo tiene).
--   2. Máximo 5 intentos fallidos de tel4 por pedido cada 15 minutos.
--   3. Las rutas de comprobante tienen formato fijo y hay un tope de 5 archivos por pedido.

-- 1) Intentos fallidos de número + tel4 (se borran solos con el pedido)
create table public.consultas_fallidas (
  numero integer primary key references public.pedidos (numero) on delete cascade,
  intentos integer not null default 0,
  desde timestamptz not null default now() -- inicio de la ventana de 15 minutos
);
alter table public.consultas_fallidas enable row level security; -- sin políticas: nadie la ve por la API
revoke all on public.consultas_fallidas from anon, authenticated;

-- 2) consultar_pedido: ahora plpgsql (VOLATILE, porque anota intentos). El front lo llama por POST.
create or replace function public.consultar_pedido(p_codigo text default null, p_numero integer default null, p_tel4 text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_por_codigo boolean := p_codigo is not null;
  v_id uuid;
  v_tel text;
  v_intentos integer;
begin
  if v_por_codigo then
    select id into v_id from public.pedidos where codigo_publico = lower(trim(p_codigo));
  elsif p_numero is not null and p_tel4 ~ '^\d{4}$' then
    select id, telefono into v_id, v_tel from public.pedidos where numero = p_numero;
    if v_id is null then return null; end if; -- número inexistente: no se anota nada

    select intentos into v_intentos from public.consultas_fallidas
     where numero = p_numero and desde > now() - interval '15 minutes';
    if coalesce(v_intentos, 0) >= 5 then
      raise exception 'demasiados intentos, probá en unos minutos';
    end if;

    if right(v_tel, 4) <> p_tel4 then
      insert into public.consultas_fallidas as f (numero, intentos, desde)
      values (p_numero, 1, now())
      on conflict (numero) do update set
        intentos = case when f.desde > now() - interval '15 minutes' then f.intentos + 1 else 1 end,
        desde    = case when f.desde > now() - interval '15 minutes' then f.desde else now() end;
      return null;
    end if;
  else
    return null;
  end if;

  if v_id is null then return null; end if;

  return (
    select jsonb_build_object(
      'numero', p.numero,
      'codigo', 'BH-' || lpad(p.numero::text, 4, '0'),
      -- Solo quien ya tiene el código (link del WhatsApp) lo recibe de vuelta
      'codigo_publico', case when v_por_codigo then p.codigo_publico end,
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
    from public.pedidos p where p.id = v_id);
end $$;
revoke all on function public.consultar_pedido(text, integer, text) from public;
grant execute on function public.consultar_pedido(text, integer, text) to anon, authenticated;

-- 3) Subida al storage: ruta exacta {codigo_publico}/{id}.{webp|jpg|png|pdf} y hasta 5 archivos por pedido
create or replace function public.puede_subir_comprobante(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_ruta ~ '^[0-9a-f]{8}/[a-z0-9-]{8,64}\.(webp|jpg|png|pdf)$'
     and exists (
       select 1 from public.pedidos p
       where p.codigo_publico = split_part(p_ruta, '/', 1)
         and p.medio_pago = 'transferencia'
         and p.pago_estado in ('pendiente', 'enviado')
         and p.estado not in ('entregado', 'cancelado'))
     and (select count(*) from storage.objects o
           where o.bucket_id = 'comprobantes'
             and o.name like split_part(p_ruta, '/', 1) || '/%') < 5;
$$;
revoke all on function public.puede_subir_comprobante(text) from public;
grant execute on function public.puede_subir_comprobante(text) to anon, authenticated;

-- 4) adjuntar_comprobante: misma validación de formato de ruta
create or replace function public.adjuntar_comprobante(p_codigo text, p_ruta text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_codigo text := lower(trim(p_codigo));
begin
  if p_ruta !~ '^[0-9a-f]{8}/[a-z0-9-]{8,64}\.(webp|jpg|png|pdf)$'
     or split_part(p_ruta, '/', 1) <> v_codigo
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
