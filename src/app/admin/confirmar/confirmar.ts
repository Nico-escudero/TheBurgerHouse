import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ConfirmarService } from './confirmar.service';

@Component({
  selector: 'app-confirmar',
  templateUrl: './confirmar.html',
  styleUrl: './confirmar.scss',
})
export class Confirmar {
  protected readonly servicio = inject(ConfirmarService);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly cancelarBtn = viewChild<ElementRef<HTMLButtonElement>>('cancelarBtn');

  constructor() {
    // Abre/cierra el <dialog> según haya una pregunta pendiente
    effect(() => {
      const abierto = this.servicio.actual() !== null;
      const d = this.dialogo().nativeElement;
      if (abierto && !d.open) {
        d.showModal();
        this.cancelarBtn()?.nativeElement.focus(); // foco en la opción segura
      } else if (!abierto && d.open) {
        d.close();
      }
    });
  }

  protected responder(ok: boolean): void {
    this.servicio.actual()?.responder(ok);
  }

  // Click en el fondo (fuera de la caja) = cancelar
  protected clickFondo(evento: MouseEvent): void {
    if (evento.target === this.dialogo().nativeElement) this.responder(false);
  }
}
