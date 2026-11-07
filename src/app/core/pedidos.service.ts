import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import type { LineaCarrito } from './carrito.service';
import {
  ConsultaPedido,
  DatosCliente,
  PedidoCreado,
  PedidoPublico,
  terminado,
} from './pedidos.models';

const EN_CURSO_KEY = 'bh_pedido_en_curso';
const TIMEOUT_MS = 4000; // más de esto esperando la base: se pide por WhatsApp sin número
const POLLING_MS = 20_000;

// El local apagó "Recibiendo pedidos" (crear_pedido lanza este error)
export class LocalCerrado extends Error {}

export interface PedidoGuardado {
  codigo_publico: string;
  codigo: string;
}

// Llama a una función RPC pública de Supabase con fetch directo (sin supabase-js: el sitio
// público no carga esa librería, igual que MenuService)
async function rpc<T>(funcion: string, args: object, timeoutMs?: number): Promise<T> {
  const control = new AbortController();
  const timer = timeoutMs ? setTimeout(() => control.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(`${environment.supabaseUrl}/rest/v1/rpc/${funcion}`, {
      method: 'POST',
      headers: { apikey: environment.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: control.signal,
    });
    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as { message?: string };
      const mensaje = error.message ?? `Supabase ${res.status}`;
      if (/no se reciben pedidos/i.test(mensaje)) throw new LocalCerrado(mensaje);
      throw new Error(mensaje);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// Pedidos del lado del cliente: crear, consultar y seguir el estado
@Injectable({ providedIn: 'root' })
export class PedidosService {
  // Último pedido hecho desde este navegador (para la franja "pedido en curso")
  readonly enCurso = signal<PedidoGuardado | null>(this.leerEnCurso());

  // Manda SOLO producto_id, cantidad y con_papas: los precios y el total los calcula la base.
  // Si tarda más de 4 s se corta (AbortError) y el carrito sigue por WhatsApp sin número.
  async crearPedido(datos: DatosCliente, carrito: LineaCarrito[]): Promise<PedidoCreado> {
    const creado = await rpc<PedidoCreado>(
      'crear_pedido',
      {
        p_nombre: datos.nombre.trim(),
        p_telefono: datos.telefono.replace(/\D/g, ''),
        p_tipo_entrega: datos.tipo_entrega,
        p_direccion: datos.tipo_entrega === 'envio' ? datos.direccion.trim() : null,
        p_aclaraciones: datos.aclaraciones.trim() || null,
        p_items: carrito.map((l) => ({
          producto_id: l.producto.id,
          cantidad: l.cantidad,
          con_papas: l.conPapas,
        })),
      },
      TIMEOUT_MS,
    );
    this.guardarEnCurso({ codigo_publico: creado.codigo_publico, codigo: creado.codigo });
    return creado;
  }

  // Por código público (link de WhatsApp) o por número + últimos 4 del teléfono. null = no existe
  buscarPedido(consulta: ConsultaPedido): Promise<PedidoPublico | null> {
    const args =
      'codigo_publico' in consulta
        ? { p_codigo: consulta.codigo_publico }
        : { p_numero: consulta.numero, p_tel4: consulta.tel4 };
    return rpc<PedidoPublico | null>('consultar_pedido', args, 10_000);
  }

  /**
   * Consulta el pedido cada 20 s y avisa con `alCambiar`. Se pausa con la pestaña oculta
   * (al volver consulta enseguida) y se detiene solo si el pedido llega a entregado/cancelado.
   * Devuelve la función para cortar el seguimiento.
   */
  escucharPedido(
    consulta: ConsultaPedido,
    alCambiar: (p: PedidoPublico | null) => void,
    alFallar: (e: unknown) => void = () => {},
  ): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activo = true;

    const programar = () => {
      clearTimeout(timer);
      if (activo && document.visibilityState === 'visible')
        timer = setTimeout(consultar, POLLING_MS);
    };
    const consultar = async () => {
      try {
        const p = await this.buscarPedido(consulta);
        if (!activo) return;
        alCambiar(p);
        if (!p || terminado(p.estado)) return parar();
      } catch (e) {
        if (activo) alFallar(e);
      }
      programar();
    };
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') consultar();
      else clearTimeout(timer);
    };
    const parar = () => {
      activo = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };

    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    programar();
    return parar;
  }

  olvidarEnCurso(): void {
    this.enCurso.set(null);
    try {
      localStorage.removeItem(EN_CURSO_KEY);
    } catch {
      /* modo privado: se ignora */
    }
  }

  private guardarEnCurso(p: PedidoGuardado): void {
    this.enCurso.set(p);
    try {
      localStorage.setItem(EN_CURSO_KEY, JSON.stringify(p));
    } catch {
      /* sin espacio o modo privado: se ignora */
    }
  }

  private leerEnCurso(): PedidoGuardado | null {
    try {
      const raw = localStorage.getItem(EN_CURSO_KEY);
      const p = raw ? (JSON.parse(raw) as PedidoGuardado) : null;
      return p?.codigo_publico ? p : null;
    } catch {
      return null; // prerender (sin localStorage) o dato corrupto
    }
  }
}

// Link de seguimiento: siteUrl de environment, o el dominio actual si está vacío
export function linkSeguimiento(codigoPublico: string): string {
  const base = environment.siteUrl || (typeof location !== 'undefined' ? location.origin : '');
  return `${base}/pedido/${codigoPublico}`;
}
