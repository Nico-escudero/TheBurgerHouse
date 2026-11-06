import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CarritoService } from '../core/carrito.service';
import { formatoPrecio } from '../core/formato';
import { cerrarDialogo, entrarPanel, volarAlCarrito } from '../core/animaciones';
import { Producto } from '../core/models';

// Ficha del producto tocado: foto, descripción, opción con papas, cantidad y "Agregar"
@Component({
  selector: 'app-ficha',
  templateUrl: './ficha.html',
  styleUrl: './ficha.scss',
})
export class Ficha {
  protected readonly carrito = inject(CarritoService);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  // Último producto abierto: queda pintado mientras la hoja sale animada
  private readonly ultimo = signal<Producto | null>(null);
  protected readonly producto = computed(() => this.carrito.ficha() ?? this.ultimo());
  protected readonly conPapas = signal(false);
  protected readonly cantidad = signal(1);

  protected readonly precioUnitario = computed(() => {
    const p = this.producto();
    if (!p) return 0;
    return this.conPapas() && p.precio_con_papas ? p.precio_con_papas : p.precio;
  });
  protected readonly total = computed(() => this.precioUnitario() * this.cantidad());
  protected readonly extraPapas = computed(() => {
    const p = this.producto();
    return p?.precio_con_papas ? p.precio_con_papas - p.precio : 0;
  });

  protected readonly precio = formatoPrecio;

  constructor() {
    // Abre/cierra el <dialog> según haya producto seleccionado; cada apertura arranca de cero
    effect(() => {
      const d = this.dialogo().nativeElement;
      const p = this.carrito.ficha();
      if (p) {
        this.ultimo.set(p);
        this.conPapas.set(false);
        this.cantidad.set(1);
        d.classList.remove('cerrando');
        if (!d.open) {
          d.showModal();
          // Después de que Angular pinte el producto nuevo: foto y textos entran escalonados
          setTimeout(() => entrarPanel(d.querySelectorAll('.ficha__cuerpo > *')));
        }
      } else {
        cerrarDialogo(d);
      }
    });
  }

  protected restar(): void {
    this.cantidad.update((n) => Math.max(1, n - 1));
  }

  protected sumar(): void {
    this.cantidad.update((n) => n + 1);
  }

  protected agregar(): void {
    const p = this.producto();
    if (p) {
      // La carita vuela desde el botón "Agregar" hasta el carrito
      volarAlCarrito(this.dialogo().nativeElement.querySelector('.ficha__agregar')!);
      this.carrito.agregar(p, this.conPapas(), this.cantidad());
    }
    this.cerrar();
  }

  protected cerrar(): void {
    this.carrito.ficha.set(null);
  }

  // Esc: en vez del cierre instantáneo del navegador, sale con animación
  protected cancelar(evento: Event): void {
    evento.preventDefault();
    this.cerrar();
  }

  // Click en el fondo oscuro (fuera de la hoja) cierra
  protected clickFondo(evento: MouseEvent): void {
    if (evento.target === evento.currentTarget) this.cerrar();
  }

  // Si la foto no carga, queda el placeholder con la carita
  protected ocultarImagen(evento: Event): void {
    (evento.target as HTMLImageElement).hidden = true;
  }
}
