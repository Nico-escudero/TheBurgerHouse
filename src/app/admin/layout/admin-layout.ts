import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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

  constructor() {
    inject(AdminService).cargar();
  }

  protected async salir(): Promise<void> {
    await this.auth.salir();
    this.router.navigateByUrl('/admin/login');
  }
}
