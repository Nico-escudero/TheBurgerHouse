// Limpieza diaria (la llama pg_cron a las 06:00 de Argentina, ver supabase/02_limpieza.sql):
// 1. limpiar_pedidos(): guarda el resumen del día y borra los pedidos terminados de hace más de 2 días.
// 2. Borra del storage los comprobantes cuyos pedidos ya no existen (SQL no puede borrar archivos).
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'comprobantes';

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Solo el cron conoce la clave (está en Vault): cualquier otra llamada se rechaza
  const { data: valida } = await sb.rpc('clave_limpieza_valida', {
    p_clave: req.headers.get('x-limpieza') ?? '',
  });
  if (valida !== true) return new Response('No autorizado', { status: 401 });

  const { data: borrados, error } = await sb.rpc('limpiar_pedidos');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Primero se listan las carpetas y DESPUÉS se leen los pedidos vivos: un pedido creado en el medio
  // aparece como vivo y su comprobante no se borra por error.
  const { data: carpetas, error: errLista } = await sb.storage.from(BUCKET).list('', { limit: 1000 });
  if (errLista) return Response.json({ borrados, error: errLista.message }, { status: 500 });

  const { data: vivos } = await sb.from('pedidos').select('codigo_publico');
  const existen = new Set((vivos ?? []).map((p) => p.codigo_publico as string));

  let archivos = 0;
  for (const carpeta of carpetas ?? []) {
    if (existen.has(carpeta.name)) continue;
    const { data: contenido } = await sb.storage.from(BUCKET).list(carpeta.name, { limit: 100 });
    const rutas = (contenido ?? []).map((f) => `${carpeta.name}/${f.name}`);
    if (!rutas.length) continue;
    const { error: errBorrar } = await sb.storage.from(BUCKET).remove(rutas);
    if (!errBorrar) archivos += rutas.length;
  }

  return Response.json({ borrados, archivos });
});
