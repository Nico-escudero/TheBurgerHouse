import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CarritoService, LineaCarrito } from '../core/carrito.service';
import { formatoPrecio } from '../core/formato';
import { borrarFila, cerrarDialogo, entrarPanel } from '../core/animaciones';
import { MenuService } from '../core/menu.service';
import { LocalCerrado, PedidosService, linkSeguimiento } from '../core/pedidos.service';
import { PedidoConfirmado, Confirmacion } from './pedido-confirmado';

// Panel "Tu pedido": hoja desde abajo en mobile, panel lateral en desktop
@Component({
  selector: 'app-carrito',
  imports: [PedidoConfirmado],
  templateUrl: './carrito.html',
  styleUrl: './carrito.scss',
})
export class Carrito {
  protected readonly carrito = inject(CarritoService);
  private readonly pedidos = inject(PedidosService);
  private readonly menu = inject(MenuService);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  protected readonly precio = formatoPrecio;

  // Los errores se muestran recién después del primer intento de pedir
  protected readonly intento = signal(false);
  protected readonly faltaNombre = computed(() => !this.carrito.nombre().trim());
  // La base pide al menos 8 dígitos (con característica: 2494...)
  protected readonly faltaTelefono = computed(
    () => this.carrito.telefono().replace(/\D/g, '').length < 8,
  );
  protected readonly faltaDireccion = computed(
    () => this.carrito.entrega() === 'envio' && !this.carrito.direccion().trim(),
  );
  protected readonly faltan = computed(() =>
    [
      this.faltaNombre() && 'tu nombre',
      this.faltaTelefono() && 'tu teléfono',
      this.faltaDireccion() && 'la dirección de entrega',
    ].filter((x): x is string => !!x),
  );
  // 'tu nombre, tu teléfono y la dirección de entrega'
  protected readonly textoFaltan = computed(() => {
    const f = this.faltan();
    return f.length > 1 ? f.slice(0, -1).join(', ') + ' y ' + f[f.length - 1] : (f[0] ?? '');
  });

  // Guardando el pedido en la base (antes de abrir WhatsApp)
  protected readonly enviando = signal(false);
  // 'sin-numero': falló la base y el pedido sale por WhatsApp como siempre, sin número ni link
  protected readonly aviso = signal<'sin-numero' | null>(null);
  // Pedido guardado: abre el popup "¡Listo! Tu pedido es el BH-0427"
  protected readonly confirmado = signal<Confirmacion | null>(null);

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
    this.aviso.set(null);
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

  // Guarda el pedido en la base (número de orden + link de seguimiento) y abre WhatsApp.
  // Si la base falla, tarda más de 4 s o no hay conexión, se pide por WhatsApp como antes:
  // el pedido nunca se pierde por un error de la base. Solo se frena si el local no toma pedidos.
  protected async pedir(): Promise<void> {
    if (this.enviando() || !this.carrito.recibiendo()) return;
    this.intento.set(true);
    if (this.faltan().length) {
      // Lleva el foco al primer campo incompleto (después de que se pinte el borde rojo)
      setTimeout(() =>
        this.dialogo().nativeElement.querySelector<HTMLInputElement>('.campo.error input')?.focus(),
      );
      return;
    }
    // Ya falló una vez: va directo a WhatsApp (si la base guardó tarde, no se duplica el pedido)
    if (this.aviso() === 'sin-numero') return this.abrir(this.carrito.linkWhatsApp());

    this.enviando.set(true);
    try {
      const creado = await this.pedidos.crearPedido(
        {
          nombre: this.carrito.nombre(),
          telefono: this.carrito.telefono(),
          tipo_entrega: this.carrito.entrega(),
          direccion: this.carrito.direccion(),
          aclaraciones: this.carrito.aclaraciones(),
        },
        this.carrito.lineas(),
      );
      const link = linkSeguimiento(creado.codigo_publico);
      const whatsapp = this.carrito.linkWhatsApp({ codigo: creado.codigo, link });
      this.confirmado.set({
        codigo: creado.codigo,
        codigoPublico: creado.codigo_publico,
        whatsapp,
      });
      // Ya quedó guardado: se vacía para que un segundo toque no lo duplique
      this.cerrar();
      this.carrito.vaciar();
      this.abrir(whatsapp);
    } catch (e) {
      if (e instanceof LocalCerrado) {
        // El local apagó los pedidos mientras la página estaba abierta
        this.menu.config.update((c) => ({ ...c, recibiendo_pedidos: 'false' }));
        return;
      }
      console.error('No se pudo guardar el pedido, sigue por WhatsApp sin número', e);
      this.aviso.set('sin-numero');
      this.abrir(this.carrito.linkWhatsApp());
    } finally {
      this.enviando.set(false);
    }
  }

  // Si el navegador bloquea la ventana, el popup de confirmación tiene su propio botón de WhatsApp
  private abrir(link: string): void {
    window.open(link, '_blank', 'noopener');
  }
}
