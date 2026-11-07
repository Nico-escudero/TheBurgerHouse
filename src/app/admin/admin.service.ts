import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { Categoria, Producto, Salsa } from '../core/models';
import { extensionDe } from '../core/imagen';

const BUCKET = 'productos';

export type DatosProducto = Pick<
  Producto,
  'categoria_id' | 'nombre' | 'descripcion' | 'precio' | 'precio_con_papas' | 'stock' | 'activo'
>;

// Lectura y escritura del menú desde el dashboard (RLS: solo usuarios de la tabla admins pueden escribir)
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly sb = inject(SupabaseService).client;

  readonly categorias = signal<Categoria[]>([]); // con TODOS los productos, también los ocultos
  readonly salsas = signal<Salsa[]>([]);
  readonly config = signal<Record<string, string>>({});
  readonly cargando = signal(false);

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const [cats, salsas, cfg] = await Promise.all([
        this.sb
          .from('categorias')
          .select('*, productos(*)')
          .order('orden')
          .order('orden', { referencedTable: 'productos' }),
        this.sb.from('salsas').select('*').order('orden'),
        this.sb.from('configuracion').select('clave, valor'),
      ]);
      const fallo = cats.error ?? salsas.error ?? cfg.error;
      if (fallo) throw fallo;
      this.categorias.set((cats.data ?? []) as Categoria[]);
      this.salsas.set((salsas.data ?? []) as Salsa[]);
      this.config.set(Object.fromEntries((cfg.data ?? []).map((r) => [r.clave, r.valor])));
    } finally {
      this.cargando.set(false);
    }
  }

  producto(id: string): Producto | undefined {
    return this.categorias().flatMap((c) => c.productos).find((p) => p.id === id);
  }

  // ===== Productos =====

  // Crea o actualiza. Si viene foto nueva (ya en WebP) se sube y se borra la anterior.
  async guardarProducto(datos: DatosProducto, id: string | null, foto: Blob | null, quitarFoto: boolean): Promise<void> {
    const anterior = id ? this.producto(id) : undefined;
    let imagen_url = anterior?.imagen_url ?? null;

    if (foto) {
      imagen_url = await this.subirFoto(foto);
    } else if (quitarFoto) {
      imagen_url = null;
    }

    if (id) {
      const { error } = await this.sb.from('productos').update({ ...datos, imagen_url }).eq('id', id);
      if (error) throw error;
    } else {
      // Va al final de su categoría
      const cat = this.categorias().find((c) => c.id === datos.categoria_id);
      const orden = Math.max(0, ...(cat?.productos.map((p) => p.orden) ?? [])) + 1;
      const { error } = await this.sb.from('productos').insert({ ...datos, imagen_url, orden });
      if (error) throw error;
    }

    // La foto vieja se borra recién cuando el producto ya apunta a la nueva
    if (anterior?.imagen_url && anterior.imagen_url !== imagen_url) {
      await this.borrarFoto(anterior.imagen_url);
    }
    await this.cargar();
  }

  async borrarProducto(p: Producto): Promise<void> {
    const { error } = await this.sb.from('productos').delete().eq('id', p.id);
    if (error) throw error;
    if (p.imagen_url) await this.borrarFoto(p.imagen_url);
    await this.cargar();
  }

  async cambiar(p: Producto, campo: 'stock' | 'activo', valor: boolean): Promise<void> {
    const { error } = await this.sb.from('productos').update({ [campo]: valor }).eq('id', p.id);
    if (error) throw error;
    this.actualizarLocal(p.id, { [campo]: valor });
  }

  private actualizarLocal(id: string, cambios: Partial<Producto>): void {
    this.categorias.update((cats) =>
      cats.map((c) => ({
        ...c,
        productos: c.productos.map((p) => (p.id === id ? { ...p, ...cambios } : p)),
      })),
    );
  }

  // ===== Fotos (bucket público "productos") =====
  private async subirFoto(foto: Blob): Promise<string> {
    // randomUUID solo existe en https/localhost: si se abre por IP de la red local se usa otro nombre único
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const ruta = `${id}.${extensionDe(foto)}`; // webp, o jpg si se subió desde Safari
    const { error } = await this.sb.storage
      .from(BUCKET)
      .upload(ruta, foto, { contentType: foto.type || 'image/webp', cacheControl: '31536000', upsert: false });
    if (error) throw error;
    return this.sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
  }

  private async borrarFoto(url: string): Promise<void> {
    const marca = `/object/public/${BUCKET}/`;
    const i = url.indexOf(marca);
    if (i === -1) return; // no es del bucket (ej. foto externa): no se toca
    await this.sb.storage.from(BUCKET).remove([url.slice(i + marca.length)]);
  }

  // ===== Salsas =====
  async guardarSalsa(s: Pick<Salsa, 'nombre' | 'descripcion' | 'activo'>, id: number | null): Promise<void> {
    const { error } = id
      ? await this.sb.from('salsas').update(s).eq('id', id)
      : await this.sb
          .from('salsas')
          .insert({ ...s, orden: Math.max(0, ...this.salsas().map((x) => x.orden)) + 1 });
    if (error) throw error;
    await this.cargar();
  }

  async borrarSalsa(id: number): Promise<void> {
    const { error } = await this.sb.from('salsas').delete().eq('id', id);
    if (error) throw error;
    await this.cargar();
  }

  // ===== Configuración (WhatsApp, dirección) =====
  async guardarConfig(valores: Record<string, string>): Promise<void> {
    const filas = Object.entries(valores).map(([clave, valor]) => ({ clave, valor }));
    const { error } = await this.sb.from('configuracion').upsert(filas, { onConflict: 'clave' });
    if (error) throw error;
    await this.cargar();
  }
}
