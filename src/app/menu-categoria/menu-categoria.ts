import { Component, computed, inject, input } from '@angular/core';
import { Acciones } from '../acciones/acciones';
import { CarritoService } from '../core/carrito.service';
import { formatoPrecio } from '../core/formato';
import { MenuService } from '../core/menu.service';
import { Producto } from '../core/models';

// Una categoría del menú (encabezado + cards o filas), con los datos de Supabase
@Component({
  selector: 'app-menu-categoria',
  imports: [Acciones],
  templateUrl: './menu-categoria.html',
  styleUrl: './menu-categoria.scss',
})
export class MenuCategoria {
  protected readonly menu = inject(MenuService);
  protected readonly carrito = inject(CarritoService);

  readonly num = input.required<string>(); // "01", "02"…
  readonly slug = input.required<string>(); // slug de la tabla categorias

  protected readonly categoria = computed(() =>
    this.menu.categorias().find((c) => c.slug === this.slug()),
  );

  protected readonly precio = formatoPrecio;

  protected abrirFicha(p: Producto): void {
    if (p.stock) this.carrito.ficha.set(p);
  }

  // Si la foto no carga, se oculta y queda visible el placeholder con la carita (fondo de .card__foto)
  protected ocultarImagen(evento: Event): void {
    (evento.target as HTMLImageElement).hidden = true;
  }
}
