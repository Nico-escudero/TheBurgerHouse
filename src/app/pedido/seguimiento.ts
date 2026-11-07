import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatoPrecio } from '../core/formato';
import { MenuService } from '../core/menu.service';
import {
  ConsultaPedido,
  EstadoPedido,
  NOMBRE_ESTADO,
  PedidoPublico,
  flujoDe,
  hora,
  leerNumero,
  terminado,
} from '../core/pedidos.models';
import { PedidosService } from '../core/pedidos.service';
import { DatosTransferencia } from '../pago/datos-transferencia';
import { SubirComprobante } from '../pago/subir-comprobante';

interface Paso {
  estado: EstadoPedido;
  nombre: string;
  hora: string;
  fase: 'hecho' | 'actual' | 'futuro';
}

// Título y bajada de la tarjeta según el estado
const MENSAJES: Record<EstadoPedido, { titulo: string; bajada: string }> = {
  recibido: {
    titulo: '¡Recibimos tu pedido!',
    bajada: 'Ya lo tenemos. En breve empezamos a prepararlo.',
  },
  preparacion: {
    titulo: 'Estamos preparando tu pedido',
    bajada: 'Tus burgers ya están en la plancha.',
  },
  camino: { titulo: 'Tu pedido va en camino', bajada: 'Ya salió para tu dirección.' },
  listo: { titulo: '¡Tu pedido está listo para retirar!', bajada: 'Te esperamos en el local.' },
  entregado: { titulo: '¡Que lo disfrutes!', bajada: 'Gracias por pedir en The Burger House.' },
  cancelado: {
    titulo: 'Tu pedido fue cancelado',
    bajada: 'Si no sabés por qué o querés volver a pedir, escribinos por WhatsApp.',
  },
};

// /pedido (buscar por número + teléfono) y /pedido/:codigo (link del WhatsApp)
@Component({
  selector: 'app-seguimiento',
  imports: [RouterLink, DatosTransferencia, SubirComprobante],
  templateUrl: './seguimiento.html',
  styleUrl: './seguimiento.scss',
})
export class Seguimiento {
  // :codigo de la ruta (withComponentInputBinding)
  readonly codigo = input<string>();

  private readonly pedidos = inject(PedidosService);
  private readonly menu = inject(MenuService);
  protected readonly precio = formatoPrecio;
  protected readonly hora = hora;
  protected readonly nombreEstado = NOMBRE_ESTADO;

  protected readonly pedido = signal<PedidoPublico | null>(null);
  protected readonly cargando = signal(false);
  protected readonly noEncontrado = signal(false);
  protected readonly errorConexion = signal(false);

  // Formulario
  protected readonly numeroTexto = signal('');
  protected readonly tel4 = signal('');
  protected readonly errorForm = signal<string | null>(null);

  private parar?: () => void;

  protected readonly mensaje = computed(() => {
    const p = this.pedido();
    if (!p) return null;
    // Transferencia sin confirmar: lo primero que tiene que hacer el cliente es pagar
    if (p.estado === 'recibido' && p.pago_estado === 'pendiente') {
      return {
        titulo: 'Falta tu pago',
        bajada: 'Transferí y subí el comprobante para que empecemos a preparar tu pedido.',
      };
    }
    if (p.estado === 'recibido' && p.pago_estado === 'enviado') {
      return {
        titulo: 'Estamos revisando tu pago',
        bajada: 'Apenas lo confirmemos, empezamos a preparar tu pedido.',
      };
    }
    return MENSAJES[p.estado];
  });

  protected readonly terminado = terminado;

  // Código para subir el comprobante: el que devolvió la base (búsqueda por link) o, si se buscó por
  // número + tel4, el guardado en este navegador al crear ese mismo pedido. Si no hay, se usa el link.
  protected readonly codigoParaSubir = computed(() => {
    const p = this.pedido();
    if (!p) return null;
    if (p.codigo_publico) return p.codigo_publico;
    const guardado = this.pedidos.enCurso();
    return guardado?.codigo === p.codigo ? guardado.codigo_publico : null;
  });

  // Comprobante subido: se refleja al instante (el polling lo confirma después)
  protected alSubirComprobante(estado: PedidoPublico['pago_estado']): void {
    this.pedido.update((p) => (p ? { ...p, pago_estado: estado } : p));
  }

  protected readonly direccionLocal = computed(() => this.menu.config()['direccion'] ?? '');

  protected readonly pasos = computed<Paso[]>(() => {
    const p = this.pedido();
    if (!p) return [];
    const flujo = flujoDe(p.tipo_entrega);
    // Primera vez que pasó por cada estado (el historial viene ordenado)
    const horas = new Map<EstadoPedido, string>();
    for (const h of p.historial) if (!horas.has(h.estado)) horas.set(h.estado, h.at);
    if (!horas.has('recibido')) horas.set('recibido', p.created_at);

    // Cancelado: quedan hechos los pasos a los que llegó, ninguno "actual"
    const actual = p.estado === 'cancelado' ? -1 : flujo.indexOf(p.estado);
    const alcanzado =
      p.estado === 'cancelado'
        ? Math.max(0, ...flujo.map((e, i) => (horas.has(e) ? i : 0)))
        : actual;

    return flujo.map((estado, i) => ({
      estado,
      nombre: NOMBRE_ESTADO[estado],
      hora: i <= alcanzado ? hora(horas.get(estado)) : '',
      fase: i === actual ? 'actual' : i <= alcanzado ? 'hecho' : 'futuro',
    }));
  });

  protected readonly linkDudas = computed(() => {
    const numero = this.menu.config()['whatsapp'] ?? '';
    const p = this.pedido();
    const texto = p
      ? `¡Hola! Tengo una consulta por mi pedido ${p.codigo}`
      : '¡Hola! Tengo una consulta por mi pedido';
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  });

  protected readonly seActualiza = computed(() => {
    const p = this.pedido();
    return !!p && !terminado(p.estado);
  });

  constructor() {
    // WhatsApp y dirección del local (si se entra directo por el link, el menú no se cargó)
    this.menu.cargar();

    effect(() => {
      const codigo = this.codigo();
      untracked(() => {
        if (codigo) this.seguir({ codigo_publico: codigo });
        else this.reiniciar();
      });
    });

    inject(DestroyRef).onDestroy(() => this.parar?.());
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected buscar(evento: Event): void {
    evento.preventDefault();
    const numero = leerNumero(this.numeroTexto());
    const tel4 = this.tel4().trim();
    if (numero === null)
      return this.errorForm.set('Escribí el número de pedido, por ejemplo BH-0427 o 427.');
    if (!/^\d{4}$/.test(tel4))
      return this.errorForm.set('Escribí los últimos 4 números de tu teléfono.');
    this.errorForm.set(null);
    this.seguir({ numero, tel4 });
  }

  protected otraBusqueda(): void {
    this.reiniciar();
  }

  private reiniciar(): void {
    this.parar?.();
    this.pedido.set(null);
    this.noEncontrado.set(false);
    this.errorConexion.set(false);
  }

  private async seguir(consulta: ConsultaPedido): Promise<void> {
    this.reiniciar();
    this.cargando.set(true);
    try {
      const p = await this.pedidos.buscarPedido(consulta);
      this.pedido.set(p);
      this.noEncontrado.set(!p);
      if (p && terminado(p.estado)) this.olvidarSiEsElGuardado(consulta);
      if (p && !terminado(p.estado)) {
        this.parar = this.pedidos.escucharPedido(
          consulta,
          (nuevo) => {
            this.errorConexion.set(false);
            if (nuevo) this.pedido.set(nuevo);
            if (nuevo && terminado(nuevo.estado)) this.olvidarSiEsElGuardado(consulta);
          },
          () => this.errorConexion.set(true),
        );
      }
    } catch (e) {
      // Bloqueo por intentos fallidos de tel4 (consultar_pedido): no es un problema de conexión
      if (e instanceof Error && /demasiados intentos/i.test(e.message)) {
        this.errorForm.set('Demasiados intentos. Esperá unos minutos o escribinos por WhatsApp.');
        return;
      }
      console.error('No se pudo consultar el pedido', e);
      this.errorConexion.set(true);
    } finally {
      this.cargando.set(false);
    }
  }

  // Pedido terminado: deja de mostrarse la franja "pedido en curso"
  private olvidarSiEsElGuardado(consulta: ConsultaPedido): void {
    const guardado = this.pedidos.enCurso();
    const p = this.pedido();
    if (!guardado) return;
    const mismo =
      'codigo_publico' in consulta
        ? guardado.codigo_publico === consulta.codigo_publico.toLowerCase()
        : guardado.codigo === p?.codigo;
    if (mismo) this.pedidos.olvidarEnCurso();
  }
}
