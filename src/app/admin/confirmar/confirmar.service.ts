import { Injectable, signal } from '@angular/core';

export interface Pregunta {
  titulo: string;
  mensaje?: string;
  detalle?: string; // texto chico debajo del mensaje (ej. alternativa a borrar)
  aceptar?: string; // texto del botón principal
  cancelar?: string;
  peligro?: boolean; // botón principal en rojo (acciones destructivas)
}

interface Pendiente extends Pregunta {
  responder: (ok: boolean) => void;
}

// Popup de confirmación del dashboard (reemplaza a window.confirm). Lo muestra <app-confirmar>.
@Injectable({ providedIn: 'root' })
export class ConfirmarService {
  readonly actual = signal<Pendiente | null>(null);

  preguntar(pregunta: Pregunta): Promise<boolean> {
    this.actual()?.responder(false); // si había otra abierta, se cancela
    return new Promise((resolver) => {
      this.actual.set({
        ...pregunta,
        responder: (ok) => {
          this.actual.set(null);
          resolver(ok);
        },
      });
    });
  }
}
