import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatoPrecio } from '../../core/formato';
import { AdminService, DatosProducto } from '../admin.service';
import { aWebp, pesoLegible } from '../imagen';
import { describirError } from '../errores';

interface Borrador {
  categoria_id: number | null;
  nombre: string;
  descripcion: string;
  precio: number | null;
  conPapas: boolean;
  precio_con_papas: number | null;
  stock: boolean;
  activo: boolean;
}

const VACIO: Borrador = {
  categoria_id: null,
  nombre: '',
  descripcion: '',
  precio: null,
  conPapas: false,
  precio_con_papas: null,
  stock: true,
  activo: true,
};

@Component({
  selector: 'app-producto-editor',
  imports: [RouterLink],
  templateUrl: './producto-editor.html',
  styleUrl: './producto-editor.scss',
  host: { '(window:beforeunload)': 'avisoSalida($event)' },
})
export class ProductoEditor {
  protected readonly admin = inject(AdminService);
  private readonly router = inject(Router);

  readonly id = input<string>(); // parámetro :id de la ruta (vacío en "nuevo")

  protected readonly precio = formatoPrecio;
  protected readonly peso = pesoLegible;

  protected readonly form = signal<Borrador>({ ...VACIO });
  private readonly original = signal<Borrador>({ ...VACIO });
  private cargado = false;

  // ===== Foto =====
  protected readonly fotoNueva = signal<Blob | null>(null);
  protected readonly fotoNuevaUrl = signal<string | null>(null);
  protected readonly pesoOriginal = signal<number | null>(null);
  protected readonly quitarFoto = signal(false);
  protected readonly procesandoFoto = signal(false);
  protected readonly errorFoto = signal<string | null>(null);
  protected readonly arrastrando = signal(false);

  // ===== Estado =====
  protected readonly guardando = signal(false);
  protected readonly intento = signal(false);
  protected readonly errorGuardar = signal<string | null>(null);
  protected readonly vistaFicha = signal(false); // en la vista previa: card (false) o ficha (true)

  protected readonly esNuevo = computed(() => !this.id());
  protected readonly existente = computed(() => {
    const id = this.id();
    return id ? this.admin.producto(id) : undefined;
  });
  protected readonly noEncontrado = computed(
    () => !!this.id() && !this.admin.cargando() && this.admin.categorias().length > 0 && !this.existente(),
  );

  protected readonly categoria = computed(() =>
    this.admin.categorias().find((c) => c.id === this.form().categoria_id),
  );
  protected readonly modo = computed(() => this.categoria()?.modo ?? 'card');

  protected readonly fotoUrl = computed(() => {
    if (this.fotoNuevaUrl()) return this.fotoNuevaUrl();
    if (this.quitarFoto()) return null;
    return this.existente()?.imagen_url ?? null;
  });

  // ===== Validación =====
  protected readonly errores = computed(() => {
    const f = this.form();
    return {
      categoria: !f.categoria_id ? 'Elegí una categoría.' : null,
      nombre: !f.nombre.trim() ? 'Poné un nombre.' : null,
      precio: f.precio === null || f.precio <= 0 ? 'Poné un precio mayor a 0.' : null,
      papas:
        f.conPapas && (f.precio_con_papas === null || f.precio_con_papas <= 0)
          ? 'Poné el precio con papas.'
          : f.conPapas && f.precio !== null && f.precio_con_papas !== null && f.precio_con_papas <= f.precio
            ? 'Debería ser mayor al precio sin papas.'
            : null,
    };
  });
  protected readonly valido = computed(() => Object.values(this.errores()).every((e) => !e));

  protected readonly sucio = computed(
    () =>
      JSON.stringify(this.form()) !== JSON.stringify(this.original()) ||
      !!this.fotoNueva() ||
      this.quitarFoto(),
  );

  // Diferencia que se muestra en la ficha ("+$4.000")
  protected readonly extraPapas = computed(() => {
    const f = this.form();
    return f.conPapas && f.precio && f.precio_con_papas ? f.precio_con_papas - f.precio : 0;
  });

  constructor() {
    // Llena el formulario cuando llegan los datos (al editar) o elige la primera categoría (al crear)
    effect(() => {
      const cats = this.admin.categorias();
      if (this.cargado || !cats.length) return;
      const p = this.existente();
      if (this.id() && !p) return;
      const datos: Borrador = p
        ? {
            categoria_id: p.categoria_id,
            nombre: p.nombre,
            descripcion: p.descripcion ?? '',
            precio: p.precio,
            conPapas: p.precio_con_papas !== null,
            precio_con_papas: p.precio_con_papas,
            stock: p.stock,
            activo: p.activo,
          }
        : { ...VACIO, categoria_id: cats[0].id };
      this.form.set({ ...datos });
      this.original.set({ ...datos });
      this.cargado = true;
    });

    inject(DestroyRef).onDestroy(() => this.liberarUrl());
  }

  // ===== Edición de campos =====
  protected set<K extends keyof Borrador>(campo: K, valor: Borrador[K]): void {
    this.form.update((f) => ({ ...f, [campo]: valor }));
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected numero(evento: Event): number | null {
    const v = (evento.target as HTMLInputElement).value.replace(/\D/g, '');
    return v ? Number(v) : null;
  }

  protected marcado(evento: Event): boolean {
    return (evento.target as HTMLInputElement).checked;
  }

  protected cambiarCategoria(evento: Event): void {
    this.set('categoria_id', Number(this.texto(evento)) || null);
  }

  // ===== Foto =====
  protected elegirFoto(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (archivo) this.procesar(archivo);
  }

  protected soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando.set(false);
    const archivo = evento.dataTransfer?.files?.[0];
    if (archivo) this.procesar(archivo);
  }

  protected sobre(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando.set(true);
  }

  protected sacarFoto(): void {
    this.liberarUrl();
    this.fotoNueva.set(null);
    this.pesoOriginal.set(null);
    this.quitarFoto.set(!!this.existente()?.imagen_url);
  }

  private async procesar(archivo: File): Promise<void> {
    this.procesandoFoto.set(true);
    this.errorFoto.set(null);
    try {
      const webp = await aWebp(archivo);
      this.liberarUrl();
      this.fotoNueva.set(webp);
      this.fotoNuevaUrl.set(URL.createObjectURL(webp));
      this.pesoOriginal.set(archivo.size);
      this.quitarFoto.set(false);
    } catch (e) {
      this.errorFoto.set(e instanceof Error ? e.message : 'No se pudo procesar la imagen.');
    } finally {
      this.procesandoFoto.set(false);
    }
  }

  private liberarUrl(): void {
    const url = this.fotoNuevaUrl();
    if (url) URL.revokeObjectURL(url);
    this.fotoNuevaUrl.set(null);
  }

  // ===== Guardar / eliminar =====
  protected async guardar(evento: Event): Promise<void> {
    evento.preventDefault();
    this.intento.set(true);
    if (!this.valido() || this.guardando()) return;

    const f = this.form();
    const datos: DatosProducto = {
      categoria_id: f.categoria_id!,
      nombre: f.nombre.trim(),
      descripcion: f.descripcion.trim(),
      precio: f.precio!,
      precio_con_papas: f.conPapas ? f.precio_con_papas : null,
      stock: f.stock,
      activo: f.activo,
    };

    this.guardando.set(true);
    this.errorGuardar.set(null);
    try {
      await this.admin.guardarProducto(datos, this.id() ?? null, this.fotoNueva(), this.quitarFoto());
      this.original.set(this.form()); // ya no hay cambios sin guardar
      this.fotoNueva.set(null);
      this.quitarFoto.set(false);
      this.router.navigateByUrl('/admin/productos');
    } catch (e) {
      console.error(e);
      this.errorGuardar.set('No se pudo guardar. ' + describirError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async eliminar(): Promise<void> {
    const p = this.existente();
    if (!p || !confirm(`¿Eliminar "${p.nombre}"? No se puede deshacer.`)) return;
    this.guardando.set(true);
    try {
      await this.admin.borrarProducto(p);
      this.original.set(this.form());
      this.fotoNueva.set(null);
      this.quitarFoto.set(false);
      this.router.navigateByUrl('/admin/productos');
    } catch (e) {
      console.error(e);
      this.errorGuardar.set('No se pudo eliminar. ' + describirError(e));
      this.guardando.set(false);
    }
  }

  // Lo usa el guard de la ruta para avisar si hay cambios sin guardar
  puedeSalir(): boolean {
    return !this.sucio() || this.guardando() || confirm('Hay cambios sin guardar. ¿Salir igual?');
  }

  protected avisoSalida(evento: BeforeUnloadEvent): void {
    if (this.sucio() && !this.guardando()) evento.preventDefault();
  }
}
