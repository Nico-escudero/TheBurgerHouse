import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CarritoService } from '../core/carrito.service';
import { formatoPrecio } from '../core/formato';

// Panel "Tu pedido": hoja desde abajo en mobile, panel lateral en desktop
@Component({
  selector: 'app-carrito',
  templateUrl: './carrito.html',
  styleUrl: './carrito.scss',
})
export class Carrito {
  protected readonly carrito = inject(CarritoService);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  protected readonly precio = formatoPrecio;

  // Los errores se muestran recién después del primer intento de pedir
  protected readonly intento = signal(false);
  protected readonly faltaNombre = computed(() => !this.carrito.nombre().trim());
  protected readonly faltaDireccion = computed(
    () => this.carrito.entrega() === 'envio' && !this.carrito.direccion().trim(),
  );

  constructor() {
    effect(() => {
      const d = this.dialogo().nativeElement;
      if (this.carrito.abierto()) {
        if (!d.open) d.showModal();
      } else if (d.open) {
        d.close();
      }
    });
  }

  protected cerrar(): void {
    this.carrito.abierto.set(false);
    this.intento.set(false);
  }

  protected clickFondo(evento: MouseEvent): void {
    if (evento.target === evento.currentTarget) this.cerrar();
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  // Abre WhatsApp con el pedido armado; si faltan datos marca los campos
  protected pedir(): void {
    this.intento.set(true);
    if (this.faltaNombre() || this.faltaDireccion()) {
      // Lleva el foco al primer campo incompleto (después de que se pinte el borde rojo)
      setTimeout(() =>
        this.dialogo().nativeElement.querySelector<HTMLInputElement>('.campo.error input')?.focus(),
      );
      return;
    }
    window.open(this.carrito.linkWhatsApp(), '_blank', 'noopener');
  }
}
