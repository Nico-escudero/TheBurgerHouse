-- ===== Permisos mínimos (auditoría de seguridad, run-1) =====
-- Supabase da por defecto TODOS los privilegios de tabla a anon y authenticated, y la única barrera
-- es RLS. Esto deja una segunda capa: aunque una política futura quede mal, anon no puede escribir.
-- RLS sigue siendo la que decide qué filas ve/cambia el admin.

-- 1) Nadie de la API necesita TRUNCATE (RLS no lo frena), TRIGGER ni REFERENCES
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- 2) anon nunca escribe directo en tablas: pedidos y comprobantes van por las funciones security definer
revoke insert, update, delete on all tables in schema public from anon;

-- 3) anon solo lee lo que muestra el sitio (y RLS filtra igual)
revoke select on public.admins, public.pedidos, public.pedido_estados, public.resumen_diario,
                 public.consultas_fallidas
  from anon;

-- 4) Tablas que se creen de acá en adelante (por el rol que corre este script): sin estos privilegios
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete on tables from anon;

-- 5) Funciones de trigger: no tienen sentido como RPC
revoke execute on function public.pedidos_log() from public, anon, authenticated;
revoke execute on function public.pedidos_touch() from public, anon, authenticated;
revoke execute on function public.pedidos_validar_pago() from public, anon, authenticated;

-- 6) es_admin() la usan las políticas de authenticated; anon no la necesita
revoke execute on function public.es_admin() from public, anon;
