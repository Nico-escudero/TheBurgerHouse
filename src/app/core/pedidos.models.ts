// Tipos y reglas de los pedidos con seguimiento (tablas pedidos / pedido_estados y RPC públicas)

export type EstadoPedido =
  'recibido' | 'preparacion' | 'listo' | 'camino' | 'entregado' | 'cancelado';
export type TipoEntrega = 'retiro' | 'envio';
export type MedioPago = 'efectivo' | 'transferencia';
// no_aplica: efectivo · pendiente: falta comprobante · enviado: para revisar · confirmado: el local lo verificó
export type PagoEstado = 'no_aplica' | 'pendiente' | 'enviado' | 'confirmado';

// Ítem guardado en pedidos.items (lo arma la base con los precios reales)
export interface ItemPedido {
  producto_id: string;
  nombre: string;
  cantidad: number;
  con_papas: boolean;
  precio_unitario: number;
  subtotal: number;
}

// Fila completa de la tabla pedidos (solo la lee el admin, por RLS)
export interface Pedido {
  id: string;
  numero: number;
  codigo_publico: string;
  nombre: string;
  telefono: string;
  tipo_entrega: TipoEntrega;
  direccion: string | null;
  aclaraciones: string | null;
  items: ItemPedido[];
  total: number;
  estado: EstadoPedido;
  hora_estimada: string | null;
  created_at: string;
  updated_at: string;
  medio_pago: MedioPago;
  pago_estado: PagoEstado;
  comprobante_path: string | null;
  paga_con: number | null;
}

export interface CambioEstado {
  estado: EstadoPedido;
  at: string;
}

// Lo que devuelve consultar_pedido: sin nombre, teléfono ni dirección
export interface PedidoPublico {
  numero: number;
  codigo: string; // 'BH-0427'
  estado: EstadoPedido;
  tipo_entrega: TipoEntrega;
  hora_estimada: string | null;
  total: number;
  created_at: string;
  items: { nombre: string; cantidad: number; subtotal: number }[];
  historial: CambioEstado[];
  codigo_publico: string;
  medio_pago: MedioPago;
  pago_estado: PagoEstado;
}

// Lo que devuelve crear_pedido
export interface PedidoCreado {
  numero: number;
  codigo: string;
  codigo_publico: string;
  total: number;
  medio_pago: MedioPago;
}

export interface DatosCliente {
  nombre: string;
  telefono: string;
  tipo_entrega: TipoEntrega;
  direccion: string;
  aclaraciones: string;
  medio_pago: MedioPago;
  paga_con: number | null; // efectivo: con qué billete paga (vuelto)
}

export type ConsultaPedido = { codigo_publico: string } | { numero: number; tel4: string };

// ===== Flujo de estados (lo maneja el front) =====
const FLUJO: Record<TipoEntrega, EstadoPedido[]> = {
  envio: ['recibido', 'preparacion', 'camino', 'entregado'],
  retiro: ['recibido', 'preparacion', 'listo', 'entregado'],
};

export function flujoDe(tipo: TipoEntrega): EstadoPedido[] {
  return FLUJO[tipo];
}

// Siguiente paso del flujo, o null si ya terminó (entregado/cancelado)
export function siguienteEstado(p: {
  estado: EstadoPedido;
  tipo_entrega: TipoEntrega;
}): EstadoPedido | null {
  const flujo = FLUJO[p.tipo_entrega];
  const i = flujo.indexOf(p.estado);
  return i === -1 || i === flujo.length - 1 ? null : flujo[i + 1];
}

export function terminado(estado: EstadoPedido): boolean {
  return estado === 'entregado' || estado === 'cancelado';
}

export const NOMBRE_ESTADO: Record<EstadoPedido, string> = {
  recibido: 'Recibido',
  preparacion: 'En preparación',
  listo: 'Listo para retirar',
  camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

// 'BH-0427' -> 427 · '427' -> 427 · cualquier otra cosa -> null
export function leerNumero(texto: string): number | null {
  const m = texto.trim().match(/^(?:bh)?[\s-]*0*(\d{1,7})$/i);
  return m ? Number(m[1]) : null;
}

export function codigoDe(numero: number): string {
  return 'BH-' + String(numero).padStart(4, '0');
}

// '2025-...' -> '21:35'
export function hora(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// Transferencia sin pago confirmado: el local no la puede pasar a preparación (también lo valida la base)
export function esperaPago(p: { medio_pago: MedioPago; pago_estado: PagoEstado }): boolean {
  return p.medio_pago === 'transferencia' && p.pago_estado !== 'confirmado';
}

export const NOMBRE_PAGO: Record<PagoEstado, string> = {
  no_aplica: 'Efectivo',
  pendiente: 'Esperando comprobante',
  enviado: 'Comprobante para revisar',
  confirmado: 'Pagado',
};
