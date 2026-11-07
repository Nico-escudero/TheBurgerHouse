import { Component, computed, inject, input, signal } from '@angular/core';
import { formatoPrecio } from '../core/formato';
import { MenuService } from '../core/menu.service';

interface Dato {
  clave: string;
  nombre: string;
  valor: string;
  copiable: boolean;
}

// Alias / CBU / titular / banco para transferir (se editan en Admin → Ajustes) + monto, con botón Copiar
@Component({
  selector: 'app-datos-transferencia',
  template: `
    <div class="transf">
      <p class="transf__monto">
        Transferí <strong>{{ precio(total()) }}</strong>
      </p>
      <dl class="transf__datos">
        @for (d of datos(); track d.clave) {
          <div class="transf__fila">
            <dt>{{ d.nombre }}</dt>
            <dd>{{ d.valor }}</dd>
            @if (d.copiable) {
              <button
                type="button"
                class="transf__copiar"
                [attr.aria-label]="'Copiar ' + d.nombre"
                (click)="copiar(d)"
              >
                {{ copiado() === d.clave ? '¡Copiado!' : 'Copiar' }}
              </button>
            }
          </div>
        }
      </dl>
      <p class="sr-only" aria-live="polite">{{ copiado() ? 'Copiado' : '' }}</p>
    </div>
  `,
  styleUrl: './datos-transferencia.scss',
})
export class DatosTransferencia {
  readonly total = input.required<number>();
  private readonly menu = inject(MenuService);
  protected readonly precio = formatoPrecio;
  protected readonly copiado = signal<string | null>(null);

  protected readonly datos = computed<Dato[]>(() => {
    const c = this.menu.config();
    return [
      { clave: 'alias', nombre: 'Alias', valor: c['alias_transferencia'] ?? '', copiable: true },
      { clave: 'cbu', nombre: 'CBU / CVU', valor: c['cbu_transferencia'] ?? '', copiable: true },
      {
        clave: 'titular',
        nombre: 'Titular',
        valor: c['titular_transferencia'] ?? '',
        copiable: false,
      },
      { clave: 'banco', nombre: 'Banco', valor: c['banco_transferencia'] ?? '', copiable: false },
    ].filter((d) => d.valor.trim());
  });

  protected async copiar(d: Dato): Promise<void> {
    try {
      await navigator.clipboard.writeText(d.valor);
    } catch {
      // Sin permiso de portapapeles: selección + copiar
      const campo = document.createElement('textarea');
      campo.value = d.valor;
      document.body.appendChild(campo);
      campo.select();
      document.execCommand('copy');
      campo.remove();
    }
    this.copiado.set(d.clave);
    setTimeout(() => this.copiado.set(null), 2000);
  }
}
