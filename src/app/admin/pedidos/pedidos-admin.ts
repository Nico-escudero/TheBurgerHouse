import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { formatoPrecio } from '../../core/formato';
import {
  EstadoPedido,
  NOMBRE_ESTADO,
  Pedido,
  NOMBRE_PAGO,
  codigoDe,
  esperaPago,
  hora,
  siguienteEstado,
  terminado,
} from '../../core/pedidos.models';
import { describirError } from '../errores';
import { PedidoDetalle, linkCliente } from './pedido-detalle';
import { PedidosAdminService, inicioDeHoy } from './pedidos-admin.service';

type Filtro = 'todos' | 'activos' | 'nuevos' | 'preparacion' | 'listos' | 'entregados';

const ESTADOS_FILTRO: Record<Filtro, (e: EstadoPedido) => boolean> = {
  todos: () => true,
  activos: (e) => !terminado(e),
  nuevos: (e) => e === 'recibido',
  preparacion: (e) => e === 'preparacion',
  listos: (e) => e === 'listo' || e === 'camino',
  entregados: (e) => e === 'entregado',
};

const TABS_DESKTOP: { id: Filtro; nombre: string }[] = [
  { id: 'todos', nombre: 'Todos' },
  { id: 'nuevos', nombre: 'Nuevos' },
  { id: 'preparacion', nombre: 'En preparación' },
  { id: 'listos', nombre: 'Listos / en camino' },
  { id: 'entregados', nombre: 'Entregados' },
];

const TABS_MOBILE: { id: Filtro; nombre: string }[] = [
  { id: 'activos', nombre: 'Activos' },
  { id: 'nuevos', nombre: 'Nuevos' },
  { id: 'preparacion', nombre: 'Preparando' },
  { id: 'listos', nombre: 'Listos' },
  { id: 'entregados', nombre: 'Entregados' },
];

const MOBILE = '(max-width: 760px)';

@Component({
  selector: 'app-pedidos-admin',
  imports: [PedidoDetalle],
  templateUrl: './pedidos-admin.html',
  styleUrl: './pedidos-admin.scss',
})
export class PedidosAdmin {
  protected readonly svc = inject(PedidosAdminService);
  protected readonly precio = formatoPrecio;
  protected readonly hora = hora;
  protected readonly codigo = codigoDe;
  protected readonly nombrePago = NOMBRE_PAGO;
  protected readonly esperaPago = esperaPago;
  protected readonly nombreEstado = NOMBRE_ESTADO;
  protected readonly siguiente = siguienteEstado;
  protected readonly linkCliente = linkCliente;
  protected readonly describirError = describirError;

  protected readonly hoy = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  protected readonly esMobile = signal(matchMedia(MOBILE).matches);
  protected readonly filtroDesktop = signal<Filtro>('todos');
  protected readonly filtroMobile = signal<Filtro>('activos');
  protected readonly seleccionado = signal<string | null>(null);
  protected readonly ocupado = signal<string | null>(null); // id del pedido que se está guardando
  protected readonly error = signal<string | null>(null);
  protected readonly guardandoSwitch = signal(false);

  protected readonly tabs = computed(() => (this.esMobile() ? TABS_MOBILE : TABS_DESKTOP));
  protected readonly filtro = computed(() =>
    this.esMobile() ? this.filtroMobile() : this.filtroDesktop(),
  );

  protected readonly contadores = computed(() => {
    const lista = this.svc.pedidos();
    const c = {} as Record<Filtro, number>;
    for (const id of Object.keys(ESTADOS_FILTRO) as Filtro[]) {
      c[id] = lista.filter((p) => ESTADOS_FILTRO[id](p.estado)).length;
    }
    return c;
  });

  // Tarjetas de resumen del día
  protected readonly resumen = computed(() => {
    const desde = inicioDeHoy().getTime();
    const deHoy = this.svc.pedidos().filter((p) => new Date(p.created_at).getTime() >= desde);
    const c = this.contadores();
    return {
      nuevos: c.nuevos,
      preparacion: c.preparacion,
      listos: c.listos,
      entregados: deHoy.filter((p) => p.estado === 'entregado').length,
      vendido: deHoy.filter((p) => p.estado !== 'cancelado').reduce((n, p) => n + p.total, 0),
    };
  });

  protected readonly lista = computed(() => {
    const coincide = ESTADOS_FILTRO[this.filtro()];
    return this.svc.pedidos().filter((p) => coincide(p.estado));
  });

  protected readonly pedidoAbierto = computed(
    () => this.svc.pedidos().find((p) => p.id === this.seleccionado()) ?? null,
  );

  constructor() {
    const mq = matchMedia(MOBILE);
    const alCambiar = () => this.esMobile.set(mq.matches);
    mq.addEventListener('change', alCambiar);
    inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', alCambiar));
  }

  protected elegirFiltro(id: Filtro): void {
    if (this.esMobile()) this.filtroMobile.set(id);
    else this.filtroDesktop.set(id);
  }

  protected cantidadProductos(p: Pedido): number {
    return p.items.reduce((n, it) => n + it.cantidad, 0);
  }

  protected resumenProductos(p: Pedido): string {
    return p.items
      .map((it) => `${it.cantidad}× ${it.nombre}${it.con_papas ? ' (c/ papas)' : ''}`)
      .join(' · ');
  }

  protected async avanzar(p: Pedido, evento: Event): Promise<void> {
    evento.stopPropagation();
    const sig = siguienteEstado(p);
    if (!sig || this.ocupado()) return;
    // Transferencia sin confirmar: hay que mirar el comprobante en el detalle
    if (esperaPago(p)) return this.seleccionado.set(p.id);
    this.ocupado.set(p.id);
    this.error.set(null);
    try {
      await this.svc.cambiarEstado(p.id, sig);
    } catch (e) {
      console.error(e);
      this.error.set('No se pudo cambiar el estado. ' + describirError(e));
    } finally {
      this.ocupado.set(null);
    }
  }

  protected async cambiarRecibiendo(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    this.guardandoSwitch.set(true);
    this.error.set(null);
    try {
      await this.svc.cambiarRecibiendo(input.checked);
    } catch (e) {
      console.error(e);
      input.checked = !input.checked;
      this.error.set('No se pudo cambiar "Recibiendo pedidos". ' + describirError(e));
    } finally {
      this.guardandoSwitch.set(false);
    }
  }
}
