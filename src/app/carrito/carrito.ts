import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CarritoService, LineaCarrito } from '../core/carrito.service';
import { formatoPrecio } from '../core/formato';
import { borrarFila, cerrarDialogo, entrarPanel } from '../core/animaciones';

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
        d.classList.remove('cerrando');
        if (!d.open) {
          d.showModal();
          // Productos (o el estado vacío) y el pie entran escalonados detrás de la hoja
          entrarPanel(d.querySelectorAll('.linea, .datos, .carrito__pie, .carrito__vacio > *'));
        }
      } else {
        cerrarDialogo(d);
      }
    });
  }

  protected cerrar(): void {
    this.carrito.abierto.set(false);
    this.intento.set(false);
    this.confirmarVaciar.set(false);
  }

  // Esc: en vez del cierre instantáneo del navegador, sale con animación
  protected cancelar(evento: Event): void {
    evento.preventDefault();
    this.cerrar();
  }

  // Tacho, o "−" con una sola unidad: la fila sale animada y recién después se borra
  protected borrar(l: LineaCarrito, evento: Event): void {
    const fila = (evento.currentTarget as HTMLElement).closest<HTMLElement>('.linea');
    // El índice se busca al final: mientras sale pudieron borrarse otras filas
    const quitar = () => {
      const i = this.carrito
        .lineas()
        .findIndex((x) => x.producto.id === l.producto.id && x.conPapas === l.conPapas);
      if (i !== -1) this.carrito.quitar(i);
    };
    if (fila) borrarFila(fila, quitar);
    else quitar();
  }

  // "Vaciar pedido": primer toque arma la confirmación (3 s), el segundo borra todo animado
  protected readonly confirmarVaciar = signal(false);
  private timerVaciar = 0;

  protected vaciar(): void {
    clearTimeout(this.timerVaciar);
    if (!this.confirmarVaciar()) {
      this.confirmarVaciar.set(true);
      this.timerVaciar = window.setTimeout(() => this.confirmarVaciar.set(false), 3000);
      return;
    }
    this.confirmarVaciar.set(false);
    const filas = this.dialogo().nativeElement.querySelectorAll<HTMLElement>('.linea');
    if (!filas.length) return this.carrito.vaciar();
    // Las filas salen escalonadas; al terminar la última se vacía el carrito
    filas.forEach((fila, n) =>
      setTimeout(
        () => borrarFila(fila, n === filas.length - 1 ? () => this.carrito.vaciar() : () => {}),
        n * 60,
      ),
    );
  }

  protected restar(l: LineaCarrito, i: number, evento: Event): void {
    if (l.cantidad === 1) this.borrar(l, evento);
    else this.carrito.cambiar(i, -1);
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
