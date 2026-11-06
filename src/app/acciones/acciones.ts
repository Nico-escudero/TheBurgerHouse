import { Component, computed, inject, input } from '@angular/core';
import { volarAlCarrito } from '../core/animaciones';
import { CarritoService } from '../core/carrito.service';
import { Producto } from '../core/models';

// Botón "+" / contador "− n +" / "Sin stock" de un producto. La cantidad sale del carrito.
@Component({
  selector: 'app-acciones',
  templateUrl: './acciones.html',
  styleUrl: './acciones.scss',
})
export class Acciones {
  private readonly carrito = inject(CarritoService);

  readonly producto = input.required<Producto>();
  protected readonly cantidad = computed(() => this.carrito.cantidadDe(this.producto().id));

  protected sumar(evento: MouseEvent): void {
    // La carita vuela desde el botón tocado hasta el carrito
    volarAlCarrito(evento.currentTarget as HTMLElement);
    this.carrito.agregar(this.producto());
  }

  protected restar(): void {
    this.carrito.restarProducto(this.producto().id);
  }
}
