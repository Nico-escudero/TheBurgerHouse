import { Component, effect, inject, signal } from '@angular/core';
import { AdminService } from '../admin.service';
import { describirError } from '../errores';

// Datos generales: número de WhatsApp que recibe los pedidos y dirección del local
@Component({
  selector: 'app-ajustes',
  templateUrl: './ajustes.html',
  styleUrl: './ajustes.scss',
})
export class Ajustes {
  protected readonly admin = inject(AdminService);

  protected readonly whatsapp = signal('');
  protected readonly direccion = signal('');
  protected readonly alias = signal('');
  protected readonly cbu = signal('');
  protected readonly titular = signal('');
  protected readonly banco = signal('');
  protected readonly guardando = signal(false);
  protected readonly mensaje = signal<{ ok: boolean; texto: string } | null>(null);

  constructor() {
    effect(() => {
      const cfg = this.admin.config();
      this.whatsapp.set(cfg['whatsapp'] ?? '');
      this.direccion.set(cfg['direccion'] ?? '');
      this.alias.set(cfg['alias_transferencia'] ?? '');
      this.cbu.set(cfg['cbu_transferencia'] ?? '');
      this.titular.set(cfg['titular_transferencia'] ?? '');
      this.banco.set(cfg['banco_transferencia'] ?? '');
    });
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected async guardar(evento: Event): Promise<void> {
    evento.preventDefault();
    const numero = this.whatsapp().replace(/\D/g, '');
    if (numero.length < 10) {
      this.mensaje.set({ ok: false, texto: 'El número de WhatsApp parece incompleto.' });
      return;
    }
    this.guardando.set(true);
    this.mensaje.set(null);
    try {
      await this.admin.guardarConfig({
        whatsapp: numero,
        direccion: this.direccion().trim(),
        alias_transferencia: this.alias().trim(),
        cbu_transferencia: this.cbu().replace(/\s/g, ''),
        titular_transferencia: this.titular().trim(),
        banco_transferencia: this.banco().trim(),
      });
      this.mensaje.set({ ok: true, texto: 'Guardado.' });
    } catch (e) {
      console.error(e);
      this.mensaje.set({ ok: false, texto: 'No se pudo guardar. ' + describirError(e) });
    } finally {
      this.guardando.set(false);
    }
  }
}
