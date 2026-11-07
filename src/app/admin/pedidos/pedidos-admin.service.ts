import { Injectable, computed, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../core/supabase.service';
import { CambioEstado, EstadoPedido, Pedido } from '../../core/pedidos.models';
import { AdminService } from '../admin.service';

const ACTIVOS = '(recibido,preparacion,listo,camino)';

export function inicioDeHoy(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Pedidos del dashboard (RLS: solo admins pueden leer y modificar la tabla pedidos)
@Injectable({ providedIn: 'root' })
export class PedidosAdminService {
  private readonly sb = inject(SupabaseService).client;
  private readonly admin = inject(AdminService);

  readonly pedidos = signal<Pedido[]>([]); // de hoy + los activos de días anteriores, más nuevos primero
  readonly cargando = signal(false);
  readonly error = signal<unknown>(null);
  readonly nuevos = computed(() => this.pedidos().filter((p) => p.estado === 'recibido').length);

  // Interruptor del local: configuracion.recibiendo_pedidos ('true' / 'false')
  readonly recibiendo = computed(() => this.admin.config()['recibiendo_pedidos'] !== 'false');

  readonly sonidoActivo = signal(false);
  private audio?: AudioContext;
  private canal?: RealtimeChannel;

  // Lo llama el layout del panel: carga la lista y queda escuchando cambios en vivo
  iniciar(): void {
    if (this.canal) return;
    this.listarPedidosHoy();
    this.escucharPedidos();
  }

  detener(): void {
    if (this.canal) this.sb.removeChannel(this.canal);
    this.canal = undefined;
  }

  async listarPedidosHoy(): Promise<void> {
    this.cargando.set(true);
    try {
      const { data, error } = await this.sb
        .from('pedidos')
        .select('*')
        .or(`created_at.gte.${inicioDeHoy().toISOString()},estado.in.${ACTIVOS}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.pedidos.set((data ?? []) as Pedido[]);
      this.error.set(null);
    } catch (e) {
      console.error('No se pudieron cargar los pedidos', e);
      this.error.set(e);
    } finally {
      this.cargando.set(false);
    }
  }

  // Realtime sobre la tabla pedidos: los nuevos aparecen solos (con sonido) y los cambios se reflejan
  escucharPedidos(): void {
    this.canal = this.sb
      .channel('admin-pedidos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, (cambio) => {
        this.actualizarLocal(cambio.new as Pedido);
        this.sonar();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos' }, (cambio) =>
        this.actualizarLocal(cambio.new as Pedido),
      )
      .subscribe((estado) => {
        // Al reconectar (se cortó internet, la pestaña durmió) se recarga por si se perdió algún evento
        if (estado === 'SUBSCRIBED' && this.pedidos().length) this.listarPedidosHoy();
      });
  }

  async cambiarEstado(id: string, estado: EstadoPedido): Promise<void> {
    await this.actualizar(id, { estado });
  }

  // null = sin hora estimada
  async fijarHora(id: string, horaEstimada: string | null): Promise<void> {
    await this.actualizar(id, { hora_estimada: horaEstimada });
  }

  async historial(pedidoId: string): Promise<CambioEstado[]> {
    const { data, error } = await this.sb
      .from('pedido_estados')
      .select('estado, created_at')
      .eq('pedido_id', pedidoId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []).map((h) => ({
      estado: h.estado as EstadoPedido,
      at: h.created_at as string,
    }));
  }

  async cambiarRecibiendo(valor: boolean): Promise<void> {
    const texto = valor ? 'true' : 'false';
    const { error } = await this.sb
      .from('configuracion')
      .upsert({ clave: 'recibiendo_pedidos', valor: texto }, { onConflict: 'clave' });
    if (error) throw error;
    this.admin.config.update((c) => ({ ...c, recibiendo_pedidos: texto }));
  }

  // ===== Sonido =====
  // El navegador no deja reproducir audio hasta que el usuario toca algo: se activa con un botón
  async activarSonido(): Promise<void> {
    this.audio ??= new AudioContext();
    await this.audio.resume();
    this.sonidoActivo.set(this.audio.state === 'running');
    this.sonar();
  }

  // "Ding-dong" corto generado en el momento (sin archivo de audio)
  private sonar(): void {
    const ctx = this.audio;
    if (!ctx || ctx.state !== 'running') return;
    [880, 660].forEach((frecuencia, i) => {
      const inicio = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, inicio);
      vol.gain.exponentialRampToValueAtTime(0.3, inicio + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.35);
      osc.connect(vol).connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.4);
    });
  }

  private async actualizar(id: string, cambios: Partial<Pedido>): Promise<void> {
    const { data, error } = await this.sb
      .from('pedidos')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    this.actualizarLocal(data as Pedido);
  }

  private actualizarLocal(p: Pedido): void {
    this.pedidos.update((lista) => {
      const i = lista.findIndex((x) => x.id === p.id);
      if (i === -1) return [p, ...lista].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return lista.map((x, j) => (j === i ? p : x));
    });
  }
}
