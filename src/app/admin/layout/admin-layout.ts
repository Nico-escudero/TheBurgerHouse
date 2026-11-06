import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { AdminService } from '../admin.service';
import { AdminEstilos } from './admin-estilos';
import { Confirmar } from '../confirmar/confirmar';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AdminEstilos, Confirmar],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly tabs = viewChild.required<ElementRef<HTMLElement>>('tabs');
  private readonly pastilla = viewChild.required<ElementRef<HTMLElement>>('pastilla');

  constructor() {
    inject(AdminService).cargar();
    const destroyRef = inject(DestroyRef);

    // Pastilla del tab activo: aparece en su lugar al abrir y después se desliza al cambiar de sección
    afterNextRender(() => {
      this.moverPastilla(false);
      // Con la fuente ya cargada el ancho de los tabs cambia: se vuelve a medir
      document.fonts.ready.then(() => this.moverPastilla(false));
      const sub = this.router.events
        .pipe(filter((e) => e instanceof NavigationEnd))
        // Un frame de espera: routerLinkActive marca el tab nuevo en el mismo NavigationEnd
        .subscribe(() => requestAnimationFrame(() => this.moverPastilla(true)));
      const alCambiarTamano = () => this.moverPastilla(false);
      window.addEventListener('resize', alCambiarTamano);
      destroyRef.onDestroy(() => {
        sub.unsubscribe();
        window.removeEventListener('resize', alCambiarTamano);
      });
    });
  }

  private moverPastilla(animada: boolean): void {
    const pastilla = this.pastilla().nativeElement;
    const activo = this.tabs().nativeElement.querySelector<HTMLElement>('a.activo');
    pastilla.classList.toggle('sin-transicion', !animada);
    if (!activo) {
      pastilla.style.opacity = '0';
      return;
    }
    pastilla.style.width = `${activo.offsetWidth}px`;
    pastilla.style.transform = `translate(${activo.offsetLeft}px, ${activo.offsetTop}px)`;
    pastilla.style.height = `${activo.offsetHeight}px`;
    pastilla.style.opacity = '1';
  }

  protected async salir(): Promise<void> {
    await this.auth.salir();
    this.router.navigateByUrl('/admin/login');
  }
}
