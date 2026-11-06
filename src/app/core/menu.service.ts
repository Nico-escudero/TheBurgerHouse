import { Injectable, PendingTasks, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { Categoria, MenuCache, Salsa } from './models';

const CACHE_KEY = 'bh_menu_v1';

// Lectura pública del menú con fetch directo a la API REST de Supabase (PostgREST).
// No usa @supabase/supabase-js: así esa librería (~200 KB) queda solo en el chunk de /admin
// y no demora la primera carga del sitio.
async function consultar<T>(ruta: string): Promise<T> {
    const res = await fetch(`${environment.supabaseUrl}/rest/v1/${ruta}`, {
        headers: { apikey: environment.supabaseKey },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
}

@Injectable({ providedIn: 'root' })
export class MenuService {
    readonly categorias = signal<Categoria[]>([]);
    readonly salsas = signal<Salsa[]>([]);
    readonly config = signal<Record<string, string>>({});
    readonly cargando = signal(true);
    readonly error = signal(false);

    // El prerender (build) espera a que termine la carga: así el HTML generado incluye el menú
    private readonly pendientes = inject(PendingTasks);

    constructor() {
        // muestra el menú guardado al instante mientras se actualiza
        const cache = this.leerCache();
        if (cache) {
            this.categorias.set(cache.categorias);
            this.salsas.set(cache.salsas);
            this.config.set(cache.config);
            this.cargando.set(false);
        }
    }

    async cargar(): Promise<void> {
        const terminar = this.pendientes.add();
        try {
            // Mismas consultas que antes con supabase-js: categorías con sus productos activos,
            // salsas activas y configuración, todo ordenado por "orden"
            const [cats, salsas, cfg] = await Promise.all([
                consultar<Categoria[]>(
                    'categorias?select=*,productos(*)&productos.activo=eq.true&order=orden.asc&productos.order=orden.asc',
                ),
                consultar<Salsa[]>('salsas?select=*&activo=eq.true&order=orden.asc'),
                consultar<{ clave: string; valor: string }[]>('configuracion?select=clave,valor'),
            ]);

            const datos: MenuCache = {
                categorias: cats ?? [],
                salsas: salsas ?? [],
                config: Object.fromEntries((cfg ?? []).map((r) => [r.clave, r.valor])),
            };

            this.categorias.set(datos.categorias);
            this.salsas.set(datos.salsas);
            this.config.set(datos.config);
            this.error.set(false);
            this.guardarCache(datos);
        } catch (e) {
            console.error('No se pudo cargar el menú', e);
            // si ya había menú guardado, se sigue mostrando ese
            this.error.set(this.categorias().length === 0);
        } finally {
            this.cargando.set(false);
            terminar();
        }
    }

    private leerCache(): MenuCache | null {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            return raw ? (JSON.parse(raw) as MenuCache) : null;
        } catch {
            return null;
        }
    }

    private guardarCache(datos: MenuCache): void {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(datos));
        } catch {
            /* sin espacio o modo privado: se ignora */
        }
    }
}