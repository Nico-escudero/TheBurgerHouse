import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { MenuService } from './menu.service';
import { Producto } from './models';
import { formatoPrecio } from './formato';

export interface LineaCarrito {
  producto: Producto;
  conPapas: boolean;
  cantidad: number;
}

export type Entrega = 'retiro' | 'envio';

const CARRITO_KEY = 'bh_carrito_v2';
const CARRITO_VIEJO = 'bh_carrito_v1'; // formato anterior, sin fecha: se descarta

// El carrito guardado vence si pasó este tiempo desde el último cambio
const CARRITO_VENCE_MS = 10 * 60 * 1000; // 10 minutos

interface CarritoGuardado {
  guardado: number; // Date.now() del último cambio
  lineas: LineaCarrito[];
}

@Injectable({ providedIn: 'root' })
export class CarritoService {
  private readonly menu = inject(MenuService);

  readonly lineas = signal<LineaCarrito[]>(this.leer());

  // ===== Estado de la UI =====
  readonly abierto = signal(false); // panel del carrito
  readonly ficha = signal<Producto | null>(null); // ficha del producto tocado

  // ===== Datos del cliente =====
  readonly nombre = signal('');
  readonly telefono = signal('');
  readonly entrega = signal<Entrega>('envio');
  readonly direccion = signal('');
  readonly aclaraciones = signal('');

  readonly cantidadTotal = computed(() => this.lineas().reduce((n, l) => n + l.cantidad, 0));
  readonly total = computed(() => this.lineas().reduce((n, l) => n + this.subtotal(l), 0));

  // Interruptor del local (configuracion.recibiendo_pedidos, se maneja desde Admin → Pedidos)
  readonly recibiendo = computed(() => this.menu.config()['recibiendo_pedidos'] !== 'false');

  // Unidades por producto (sumando con y sin papas): lo usa el contador de cada card
  private readonly porProducto = computed(() => {
    const mapa = new Map<string, number>();
    for (const l of this.lineas()) {
      mapa.set(l.producto.id, (mapa.get(l.producto.id) ?? 0) + l.cantidad);
    }
    return mapa;
  });

  constructor() {
    // Guarda el pedido para que no se pierda al recargar
    effect(() => {
      try {
        const datos: CarritoGuardado = { guardado: Date.now(), lineas: this.lineas() };
        localStorage.setItem(CARRITO_KEY, JSON.stringify(datos));
      } catch {
        /* sin espacio o modo privado: se ignora */
      }
    });

    // Cuando llega el menú actualizado: refresca precios y saca lo que ya no existe o quedó sin stock
    effect(() => {
      const productos = new Map(
        this.menu
          .categorias()
          .flatMap((c) => c.productos)
          .map((p) => [p.id, p]),
      );
      if (!productos.size) return;
      untracked(() => {
        const actuales = this.lineas();
        const nuevas = actuales
          .filter((l) => productos.get(l.producto.id)?.stock)
          .map((l) => ({ ...l, producto: productos.get(l.producto.id)! }));
        this.lineas.set(nuevas);
      });
    });
  }

  precioUnitario(l: LineaCarrito): number {
    return l.conPapas && l.producto.precio_con_papas
      ? l.producto.precio_con_papas
      : l.producto.precio;
  }

  subtotal(l: LineaCarrito): number {
    return this.precioUnitario(l) * l.cantidad;
  }

  cantidadDe(productoId: string): number {
    return this.porProducto().get(productoId) ?? 0;
  }

  agregar(producto: Producto, conPapas = false, cantidad = 1): void {
    if (!producto.stock || cantidad < 1) return;
    this.lineas.update((ls) => {
      const i = ls.findIndex((l) => l.producto.id === producto.id && l.conPapas === conPapas);
      if (i === -1) return [...ls, { producto, conPapas, cantidad }];
      return ls.map((l, j) => (j === i ? { ...l, cantidad: l.cantidad + cantidad } : l));
    });
  }

  // "−" del contador de la card: resta de la última línea agregada de ese producto
  restarProducto(productoId: string): void {
    const ls = this.lineas();
    for (let i = ls.length - 1; i >= 0; i--) {
      if (ls[i].producto.id === productoId) return this.cambiar(i, -1);
    }
  }

  cambiar(indice: number, delta: number): void {
    this.lineas.update((ls) =>
      ls
        .map((l, j) => (j === indice ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0),
    );
  }

  quitar(indice: number): void {
    this.lineas.update((ls) => ls.filter((_, j) => j !== indice));
  }

  vaciar(): void {
    this.lineas.set([]);
  }

  // ===== WhatsApp =====
  // Con `pedido` (guardado en la base) el mensaje arranca con el número y trae el link de seguimiento
  linkWhatsApp(pedido?: { codigo: string; link: string }): string {
    const numero = this.menu.config()['whatsapp'] ?? '';
    return `https://wa.me/${numero}?text=${encodeURIComponent(this.mensaje(pedido))}`;
  }

  private mensaje(pedido?: { codigo: string; link: string }): string {
    const items = this.lineas().map(
      (l) =>
        `• ${l.cantidad}x ${l.producto.nombre}${l.conPapas ? ' (con papas)' : ''}: ${formatoPrecio(this.subtotal(l))}`,
    );
    const local = this.menu.config()['direccion'] ?? 'el local';
    const entrega =
      this.entrega() === 'envio' ? `Envío a: ${this.direccion().trim()}` : `Retiro en ${local}`;
    const aclaraciones = this.aclaraciones().trim();

    const telefono = this.telefono().replace(/\D/g, '');

    return [
      pedido ? `¡Hola! Pedido *${pedido.codigo}* 🍔` : '¡Hola! Quiero hacer un pedido 🍔',
      '',
      ...items,
      '',
      `*Total: ${formatoPrecio(this.total())}*`,
      '',
      `Nombre: ${this.nombre().trim()}`,
      ...(telefono ? [`Teléfono: ${telefono}`] : []),
      entrega,
      ...(aclaraciones ? [`Aclaraciones: ${aclaraciones}`] : []),
      ...(pedido ? ['', `Seguilo acá: ${pedido.link}`] : []),
    ].join('\n');
  }

  private leer(): LineaCarrito[] {
    try {
      localStorage.removeItem(CARRITO_VIEJO);
      const raw = localStorage.getItem(CARRITO_KEY);
      if (!raw) return [];
      const datos = JSON.parse(raw) as CarritoGuardado;
      // Vencido (o sin fecha): arranca vacío
      if (!datos.guardado || Date.now() - datos.guardado > CARRITO_VENCE_MS) {
        localStorage.removeItem(CARRITO_KEY);
        return [];
      }
      return Array.isArray(datos.lineas) ? datos.lineas : [];
    } catch {
      return [];
    }
  }
}
