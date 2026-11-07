import { Component, inject, input, output, signal } from '@angular/core';
import { PagoEstado } from '../core/pedidos.models';
import { PedidosService } from '../core/pedidos.service';

// Botón "Subir comprobante": foto, captura o PDF de la transferencia
@Component({
  selector: 'app-subir-comprobante',
  template: `
    <label class="subir" [class.subiendo]="subiendo()" [class.subir--secundario]="secundario()">
      <input
        type="file"
        accept="image/*,application/pdf"
        [disabled]="subiendo()"
        (change)="elegir($event)"
      />
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      {{ subiendo() ? 'Subiendo…' : texto() }}
    </label>
    <div aria-live="polite">
      @if (error()) {
        <p class="subir__error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styleUrl: './subir-comprobante.scss',
})
export class SubirComprobante {
  readonly codigoPublico = input.required<string>();
  readonly texto = input('Subir comprobante');
  readonly secundario = input(false); // "Subir otro": con borde, sin competir con el estado
  readonly subido = output<PagoEstado>();

  private readonly pedidos = inject(PedidosService);
  protected readonly subiendo = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async elegir(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = ''; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    this.subiendo.set(true);
    this.error.set(null);
    try {
      this.subido.emit(await this.pedidos.subirComprobante(this.codigoPublico(), archivo));
    } catch (e) {
      console.error('No se pudo subir el comprobante', e);
      this.error.set(e instanceof Error ? e.message : 'No se pudo subir el comprobante.');
    } finally {
      this.subiendo.set(false);
    }
  }
}
