-- ===== Limpieza automática de pedidos (todos los días a las 06:00 de Argentina) =====
-- Borra los pedidos ENTREGADOS o CANCELADOS de hace más de 2 días (con su historial, por cascade).
-- Antes guarda el resumen del día en resumen_diario. Los comprobantes los borra la Edge Function
-- "limpiar-pedidos" (Supabase no deja borrar archivos del storage con SQL).

create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;

-- 1) Resumen de ventas por día (lo único que queda de los pedidos borrados)
create table public.resumen_diario (
  fecha date primary key, -- día en hora de Argentina
  pedidos integer not null default 0, -- sin contar cancelados
  cancelados integer not null default 0,
  total integer not null default 0, -- vendido, sin cancelados
  efectivo integer not null default 0,
  transferencia integer not null default 0,
  actualizado timestamptz not null default now()
);
alter table public.resumen_diario enable row level security;
create policy "admin lee resumen" on public.resumen_diario
  for select to authenticated using (public.es_admin());

-- 2) Borrado (solo la puede ejecutar el servidor: service_role)
create or replace function public.limpiar_pedidos()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
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

-- 3) La Edge Function valida que la llamada venga del cron comparando con la clave de Vault
--    (solo service_role puede ejecutarla). La clave se crea aparte y no queda en el repo:
-- select vault.create_secret('<clave>', 'limpieza_secret');
create or replace function public.clave_limpieza_valida(p_clave text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_clave <> '' and p_clave = (
    select decrypted_secret from vault.decrypted_secrets where name = 'limpieza_secret'), false);
$$;
revoke all on function public.clave_limpieza_valida(text) from public, anon, authenticated;
grant execute on function public.clave_limpieza_valida(text) to service_role;

-- 4) Cron: llama a la Edge Function con la clave de Vault en el header x-limpieza
select cron.schedule(
  'limpiar-pedidos',
  '0 9 * * *', -- 09:00 UTC = 06:00 Argentina
  $$
  select net.http_post(
    url := 'https://chxewldeqeqjlchumgse.supabase.co/functions/v1/limpiar-pedidos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-limpieza', (select decrypted_secret from vault.decrypted_secrets where name = 'limpieza_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
  $$
);
