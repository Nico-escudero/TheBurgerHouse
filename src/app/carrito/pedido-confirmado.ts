import {
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { cerrarDialogo } from '../core/animaciones';

export interface Confirmacion {
  codigo: string; // 'BH-0427'
  codigoPublico: string;
  whatsapp: string; // link wa.me con el mensaje armado
}

// Popup "¡Listo! Tu pedido es el BH-0427" que aparece al guardar el pedido
@Component({
  selector: 'app-pedido-confirmado',
  imports: [RouterLink],
  templateUrl: './pedido-confirmado.html',
  styleUrl: './pedido-confirmado.scss',
})
export class PedidoConfirmado {
  readonly pedido = input.required<Confirmacion>();
  readonly cerrado = output<void>();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly copiado = signal(false);

  constructor() {
    afterNextRender(() => this.dialogo().nativeElement.showModal());
  }

  protected async copiar(): Promise<void> {
    const codigo = this.pedido().codigo;
    try {
      await navigator.clipboard.writeText(codigo);
    } catch {
      // Sin permiso de portapapeles (http, navegador viejo): selección + copiar
      const campo = document.createElement('textarea');
      campo.value = codigo;
      this.dialogo().nativeElement.appendChild(campo);
      campo.select();
      document.execCommand('copy');
      campo.remove();
    }
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2000);
  }

  protected cerrar(): void {
    const d = this.dialogo().nativeElement;
    d.addEventListener('close', () => this.cerrado.emit(), { once: true });
    cerrarDialogo(d);
  }

  protected cancelar(evento: Event): void {
    evento.preventDefault();
    this.cerrar();
  }
}
