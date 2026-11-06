import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Categoria, MenuCache, Salsa } from './models';

const CACHE_KEY = 'bh_menu_v1';

@Injectable({ providedIn: 'root' })
export class MenuService {
    private sb = inject(SupabaseService).client;

    readonly categorias = signal<Categoria[]>([]);
    readonly salsas = signal<Salsa[]>([]);
    readonly config = signal<Record<string, string>>({});
    readonly cargando = signal(true);
    readonly error = signal(false);

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
        try {
            const [cats, salsas, cfg] = await Promise.all([
                this.sb
                    .from('categorias')
                    .select('*, productos(*)')
                    .eq('productos.activo', true)
                    .order('orden')
                    .order('orden', { referencedTable: 'productos' }),
                this.sb.from('salsas').select('*').eq('activo', true).order('orden'),
                this.sb.from('configuracion').select('clave, valor'),
            ]);

            const fallo = cats.error ?? salsas.error ?? cfg.error;
            if (fallo) throw fallo;

            const datos: MenuCache = {
                categorias: (cats.data ?? []) as Categoria[],
                salsas: (salsas.data ?? []) as Salsa[],
                config: Object.fromEntries((cfg.data ?? []).map((r) => [r.clave, r.valor])),
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