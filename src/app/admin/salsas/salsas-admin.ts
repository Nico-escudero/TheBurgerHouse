import { Component, inject, signal } from '@angular/core';
import { Salsa } from '../../core/models';
import { AdminService } from '../admin.service';
import { describirError } from '../errores';
import { ConfirmarService } from '../confirmar/confirmar.service';

interface BorradorSalsa {
  id: number | null; // null = nueva
  nombre: string;
  descripcion: string;
  activo: boolean;
}

@Component({
  selector: 'app-salsas-admin',
  templateUrl: './salsas-admin.html',
  styleUrl: './salsas-admin.scss',
})
export class SalsasAdmin {
  protected readonly admin = inject(AdminService);
  private readonly confirmar = inject(ConfirmarService);

  protected readonly editando = signal<BorradorSalsa | null>(null);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected nueva(): void {
    this.error.set(null);
    this.editando.set({ id: null, nombre: '', descripcion: '', activo: true });
  }

  protected editar(s: Salsa): void {
    this.error.set(null);
    this.editando.set({ id: s.id, nombre: s.nombre, descripcion: s.descripcion, activo: s.activo });
  }

  protected set<K extends keyof BorradorSalsa>(campo: K, valor: BorradorSalsa[K]): void {
    this.editando.update((b) => (b ? { ...b, [campo]: valor } : b));
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected marcado(evento: Event): boolean {
    return (evento.target as HTMLInputElement).checked;
  }

  protected async guardar(evento: Event): Promise<void> {
    evento.preventDefault();
    const b = this.editando();
    if (!b) return;
    if (!b.nombre.trim()) {
      this.error.set('Poné un nombre.');
      return;
    }
    await this.ejecutar(async () => {
      await this.admin.guardarSalsa(
        { nombre: b.nombre.trim(), descripcion: b.descripcion.trim(), activo: b.activo },
        b.id,
      );
      this.editando.set(null);
    });
  }

  protected async borrar(s: Salsa): Promise<void> {
    const ok = await this.confirmar.preguntar({
      titulo: `¿Eliminar "${s.nombre}"?`,
      mensaje: 'La salsa se borra del menú. No se puede deshacer.',
      aceptar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    await this.ejecutar(() => this.admin.borrarSalsa(s.id));
  }

  private async ejecutar(accion: () => Promise<void>): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    try {
      await accion();
    } catch (e) {
      console.error(e);
      this.error.set('No se pudo guardar. ' + describirError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
