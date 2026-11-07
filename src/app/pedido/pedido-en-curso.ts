import { Component, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { terminado } from '../core/pedidos.models';
import { PedidosService } from '../core/pedidos.service';

const CERRADA_KEY = 'bh_franja_cerrada'; // código que el cliente ya descartó en esta sesión

// Franja de arriba: "Tenés un pedido en curso: BH-0427 · Ver estado"
@Component({
  selector: 'app-pedido-en-curso',
  imports: [RouterLink],
  template: `
    @if (visible() && !enSeguimiento()) {
      <div class="franja" role="status">
        <a class="franja__link" [routerLink]="['/pedido', visible()!.codigo_publico]">
          <span class="franja__largo">Tenés un pedido en curso:</span><span class="franja__corto">En curso:</span> <strong>{{ visible()!.codigo }}</strong> · <u>Ver estado</u>
        </a>
        <button
          type="button"
          class="franja__cerrar"
          aria-label="Cerrar aviso de pedido en curso"
          (click)="cerrar()"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    }
  `,
  styleUrl: './pedido-en-curso.scss',
})
export class PedidoEnCurso {
  private readonly pedidos = inject(PedidosService);
  protected readonly visible = signal<{ codigo: string; codigo_publico: string } | null>(null);

  // En la propia página de seguimiento no hace falta
  protected readonly enSeguimiento = toSignal(
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects.startsWith('/pedido')),
    ),
    { initialValue: location.pathname.startsWith('/pedido') },
  );

  constructor() {
    // Al abrir el sitio y cada vez que se hace un pedido nuevo (o se termina el guardado)
    effect(() => {
      this.pedidos.enCurso();
      untracked(() => this.verificar());
    });
  }

  // Solo se muestra si el pedido guardado sigue activo (ni entregado ni cancelado)
  private async verificar(): Promise<void> {
    const guardado = this.pedidos.enCurso();
    if (guardado?.codigo_publico !== this.visible()?.codigo_publico) this.visible.set(null);
    if (!guardado || this.leerCerrada() === guardado.codigo_publico) return;
    try {
      const p = await this.pedidos.buscarPedido({ codigo_publico: guardado.codigo_publico });
      if (!p || terminado(p.estado)) return this.pedidos.olvidarEnCurso();
      this.visible.set({ codigo: p.codigo, codigo_publico: guardado.codigo_publico });
    } catch {
      /* sin conexión: no se muestra */
    }
  }

  protected cerrar(): void {
    const v = this.visible();
    this.visible.set(null);
    try {
      if (v) sessionStorage.setItem(CERRADA_KEY, v.codigo_publico);
    } catch {
      /* modo privado */
    }
  }

  private leerCerrada(): string | null {
    try {
      return sessionStorage.getItem(CERRADA_KEY);
    } catch {
      return null;
    }
  }
}
