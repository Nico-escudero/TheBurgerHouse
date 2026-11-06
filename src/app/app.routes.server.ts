import { RenderMode, ServerRoute } from '@angular/ssr';

// Prerender (SSG): en el build se genera el HTML de la home con el hero y el menú completo,
// para que buscadores y rastreadores de IA lo lean sin ejecutar JavaScript.
// No hay hidratación: al abrir la página, Angular la vuelve a dibujar en el navegador y
// el menú se actualiza desde Supabase como siempre (precios y stock al día).
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  // Dashboard y cualquier otra ruta: solo en el navegador (index.csr.html)
  { path: '**', renderMode: RenderMode.Client },
];
