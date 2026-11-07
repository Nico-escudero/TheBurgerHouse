import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { formatoPrecio } from '../../core/formato';
import {
  CambioEstado,
  EstadoPedido,
  NOMBRE_ESTADO,
  Pedido,
  NOMBRE_PAGO,
  codigoDe,
  esperaPago,
  flujoDe,
  hora,
} from '../../core/pedidos.models';
import { ConfirmarService } from '../confirmar/confirmar.service';
import { describirError } from '../errores';
import { PedidosAdminService } from './pedidos-admin.service';

// wa.me con el teléfono del cliente; antepone 549 (Argentina, celular) si no lo tiene
export function linkCliente(p: Pick<Pedido, 'telefono' | 'numero'>): string {
  let tel = p.telefono.replace(/\D/g, '').replace(/^0/, '');
  if (!tel.startsWith('549')) tel = '549' + (tel.startsWith('54') ? tel.slice(2) : tel);
  const texto = `¡Hola! Te escribimos de The Burger House por tu pedido ${codigoDe(p.numero)}`;
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

@Component({
  selector: 'app-pedido-detalle',
  templateUrl: './pedido-detalle.html',
  styleUrl: './pedido-detalle.scss',
  host: { '(document:keydown.escape)': 'alEscape()' },
})
export class PedidoDetalle {
  readonly pedido = input.required<Pedido>();
  readonly cerrar = output<void>();

  private readonly svc = inject(PedidosAdminService);
  private readonly confirmar = inject(ConfirmarService);
  protected readonly precio = formatoPrecio;
  protected readonly hora = hora;
  protected readonly codigo = codigoDe;
  protected readonly nombreEstado = NOMBRE_ESTADO;
  protected readonly linkCliente = linkCliente;
  protected readonly nombrePago = NOMBRE_PAGO;
  protected readonly esperaPago = esperaPago;

  // Link temporal del comprobante (bucket privado) y si es imagen o PDF
  protected readonly comprobanteUrl = signal<string | null>(null);
  protected readonly comprobanteEsPdf = computed(
    () => this.pedido().comprobante_path?.endsWith('.pdf') ?? false,
  );

  // Vuelto para el repartidor
  protected readonly vuelto = computed(() => {
    const p = this.pedido();
    return p.paga_con && p.paga_con > p.total ? p.paga_con - p.total : null;
  });

  // Sin pago confirmado no se puede avanzar (también lo bloquea la base)
  protected bloqueado(e: EstadoPedido): boolean {
    return esperaPago(this.pedido()) && e !== 'recibido' && e !== 'cancelado';
  }

  protected readonly historial = signal<CambioEstado[]>([]);
  protected readonly horaInput = signal('');
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly guardadoHora = signal(false);

  // Botones: los del flujo según tipo de entrega + Cancelado
  protected readonly botones = computed<EstadoPedido[]>(() => [
    ...flujoDe(this.pedido().tipo_entrega),
    'cancelado',
  ]);

  constructor() {
    // Al abrir otro pedido (o cuando cambia su estado) se recarga el historial
    effect(() => {
      const p = this.pedido();
      const clave = p.id + p.estado;
      untracked(() => this.cargarHistorial(p.id, clave));
    });
    // Comprobante: se pide un link nuevo cada vez que cambia el archivo
    effect(() => {
      const ruta = this.pedido().comprobante_path;
      untracked(() => this.cargarComprobante(ruta));
    });
    // Hora estimada del pedido en el campo HH:MM
    effect(() => {
      const iso = this.pedido().hora_estimada;
      untracked(() => this.horaInput.set(iso ? hora(iso) : ''));
    });
  }

  // Esc cierra el panel, salvo que esté abierto el popup de confirmación
  protected alEscape(): void {
    if (!document.querySelector('dialog[open]')) this.cerrar.emit();
  }

  private ultimaClave = '';
  private async cargarHistorial(id: string, clave: string): Promise<void> {
    this.ultimaClave = clave;
    try {
      const h = await this.svc.historial(id);
      if (this.ultimaClave === clave) this.historial.set(h);
    } catch (e) {
      console.error('No se pudo cargar el historial', e);
    }
  }

  protected async cambiar(estado: EstadoPedido): Promise<void> {
    const p = this.pedido();
    if (estado === p.estado || this.ocupado()) return;
    if (
      estado === 'cancelado' &&
      !(await this.confirmar.preguntar({
        titulo: `¿Cancelar el pedido ${codigoDe(p.numero)}?`,
        mensaje: 'El cliente lo va a ver como cancelado en la página de seguimiento.',
        aceptar: 'Sí, cancelar',
        cancelar: 'No',
        peligro: true,
      }))
    ) {
      return;
    }
    await this.guardar(() => this.svc.cambiarEstado(p.id, estado));
  }

  private async cargarComprobante(ruta: string | null): Promise<void> {
    this.comprobanteUrl.set(null);
    if (!ruta) return;
    try {
      const url = await this.svc.urlComprobante(ruta);
      if (this.pedido().comprobante_path === ruta) this.comprobanteUrl.set(url);
    } catch (e) {
      console.error('No se pudo abrir el comprobante', e);
      this.error.set('No se pudo abrir el comprobante. ' + describirError(e));
    }
  }

  protected async confirmarPago(preparar: boolean): Promise<void> {
    await this.guardar(() => this.svc.confirmarPago(this.pedido().id, preparar));
  }

  protected async rechazarComprobante(): Promise<void> {
    const p = this.pedido();
    const ok = await this.confirmar.preguntar({
      titulo: '¿Rechazar el comprobante?',
      mensaje:
        'El pedido vuelve a "Esperando comprobante" y el cliente puede subir otro desde su página.',
      detalle: 'Conviene avisarle por WhatsApp qué pasó.',
      aceptar: 'Rechazar',
      peligro: true,
    });
    if (ok) await this.guardar(() => this.svc.rechazarComprobante(p.id));
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  // HH:MM de hoy (o de mañana si ya pasó por más de 6 h: pedido de madrugada)
  protected async guardarHora(evento: Event): Promise<void> {
    evento.preventDefault();
    const texto = this.horaInput();
    let iso: string | null = null;
    if (texto) {
      const [h, m] = texto.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      if (Date.now() - d.getTime() > 6 * 60 * 60 * 1000) d.setDate(d.getDate() + 1);
      iso = d.toISOString();
    }
    await this.guardar(() => this.svc.fijarHora(this.pedido().id, iso));
    if (!this.error()) {
      this.guardadoHora.set(true);
      setTimeout(() => this.guardadoHora.set(false), 2000);
    }
  }

  protected async quitarHora(): Promise<void> {
    this.horaInput.set('');
    await this.guardar(() => this.svc.fijarHora(this.pedido().id, null));
  }

  private async guardar(accion: () => Promise<void>): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await accion();
    } catch (e) {
      console.error(e);
      this.error.set('No se pudo guardar. ' + describirError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
