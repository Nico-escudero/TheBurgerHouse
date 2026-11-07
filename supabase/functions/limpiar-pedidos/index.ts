// Limpieza diaria (la llama pg_cron a las 06:00 de Argentina, ver supabase/02_limpieza.sql):
// 1. limpiar_pedidos(): guarda el resumen del día y borra los pedidos terminados de hace más de 2 días.
// 2. Borra del storage los comprobantes cuyos pedidos ya no existen (SQL no puede borrar archivos).
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'comprobantes';
const PAGINA = 1000; // tamaño de página para pedidos (max_rows de la API) y para listar el storage

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
  const carpetas: string[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error: errLista } = await sb.storage.from(BUCKET).list('', { limit: PAGINA, offset });
    if (errLista) return Response.json({ borrados, error: errLista.message }, { status: 500 });
    carpetas.push(...data.map((c) => c.name));
    if (data.length < PAGINA) break;
  }

  // Pedidos vivos COMPLETOS, paginados. Si la lectura falla o queda incompleta se aborta:
  // con una lista parcial, comprobantes de pedidos vigentes parecerían huérfanos y se borrarían.
  const existen = new Set<string>();
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error: errVivos } = await sb
      .from('pedidos')
      .select('codigo_publico')
      .order('id')
      .range(desde, desde + PAGINA - 1);
    if (errVivos) return Response.json({ borrados, error: errVivos.message }, { status: 500 });
    for (const p of data) existen.add(p.codigo_publico as string);
    if (data.length < PAGINA) break;
  }

  let archivos = 0;
  for (const carpeta of carpetas) {
    if (existen.has(carpeta)) continue;
    // Todos los archivos de la carpeta, de a páginas (siempre offset 0: se van borrando)
    for (;;) {
      const { data: contenido, error: errCont } = await sb.storage
        .from(BUCKET)
        .list(carpeta, { limit: PAGINA });
      if (errCont || !contenido?.length) break;
      const rutas = contenido.map((f) => `${carpeta}/${f.name}`);
      const { error: errBorrar } = await sb.storage.from(BUCKET).remove(rutas);
      if (errBorrar) break;
      archivos += rutas.length;
      if (contenido.length < PAGINA) break;
    }
  }

  return Response.json({ borrados, archivos });
});
