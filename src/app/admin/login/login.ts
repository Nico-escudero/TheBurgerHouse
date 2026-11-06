import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly verPassword = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Si ya hay sesión de admin, directo al panel
    this.auth.listo.then(async () => {
      if (this.auth.sesion() && (await this.auth.esAdmin())) this.router.navigateByUrl('/admin');
    });
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected async ingresar(evento: Event): Promise<void> {
    evento.preventDefault();
    if (this.enviando()) return;
    if (!this.email().trim() || !this.password()) {
      this.error.set('Completá usuario y contraseña.');
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    const error = await this.auth.ingresar(this.email().trim(), this.password());
    this.enviando.set(false);
    if (error) {
      this.error.set(error);
      return;
    }
    this.router.navigateByUrl('/admin');
  }
}
