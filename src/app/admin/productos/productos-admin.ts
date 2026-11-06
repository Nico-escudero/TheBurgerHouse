import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatoPrecio } from '../../core/formato';
import { Producto } from '../../core/models';
import { AdminService } from '../admin.service';
import { describirError } from '../errores';
import { ConfirmarService } from '../confirmar/confirmar.service';

@Component({
  selector: 'app-productos-admin',
  imports: [RouterLink],
  templateUrl: './productos-admin.html',
  styleUrl: './productos-admin.scss',
})
export class ProductosAdmin {
  protected readonly admin = inject(AdminService);
  private readonly confirmar = inject(ConfirmarService);
  protected readonly precio = formatoPrecio;

  protected readonly filtroCategoria = signal<number | null>(null); // null = todas
  protected readonly busqueda = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly ocupado = signal<string | null>(null); // id del producto que se está guardando

  protected readonly total = computed(() =>
    this.admin.categorias().reduce((n, c) => n + c.productos.length, 0),
  );

  // Categorías visibles con sus productos filtrados por la búsqueda
  protected readonly vista = computed(() => {
    const texto = this.normalizar(this.busqueda());
    const cat = this.filtroCategoria();
    return this.admin
      .categorias()
      .filter((c) => cat === null || c.id === cat)
      .map((c) => ({
        ...c,
        productos: texto
          ? c.productos.filter((p) => this.normalizar(p.nombre + ' ' + p.descripcion).includes(texto))
          : c.productos,
      }))
      .filter((c) => !texto || c.productos.length);
  });

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected async cambiar(p: Producto, campo: 'stock' | 'activo', evento: Event): Promise<void> {
    const valor = (evento.target as HTMLInputElement).checked;
    await this.ejecutar(p.id, () => this.admin.cambiar(p, campo, valor), () => {
      (evento.target as HTMLInputElement).checked = !valor; // vuelve atrás si falló
    });
  }

  protected async borrar(p: Producto): Promise<void> {
    const ok = await this.confirmar.preguntar({
      titulo: `¿Eliminar "${p.nombre}"?`,
      mensaje: 'El producto se borra del menú. No se puede deshacer.',
      detalle: 'Si solo querés sacarlo un tiempo, usá "Visible".',
      aceptar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    await this.ejecutar(p.id, () => this.admin.borrarProducto(p));
  }

  private async ejecutar(id: string, accion: () => Promise<void>, alFallar?: () => void): Promise<void> {
    this.ocupado.set(id);
    this.error.set(null);
    try {
      await accion();
    } catch (e) {
      console.error(e);
      alFallar?.();
      this.error.set('No se pudo guardar el cambio. ' + describirError(e));
    } finally {
      this.ocupado.set(null);
    }
  }

  private normalizar(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
}
