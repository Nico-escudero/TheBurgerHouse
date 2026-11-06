import { Injectable, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

// Sesión del dashboard (usuarios creados en Supabase Auth + tabla admins)
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService).client;

  readonly sesion = signal<Session | null>(null);

  // Se resuelve cuando Supabase terminó de leer la sesión guardada
  readonly listo: Promise<void>;

  constructor() {
    this.listo = this.sb.auth.getSession().then(({ data }) => {
      this.sesion.set(data.session);
    });
    this.sb.auth.onAuthStateChange((_evento, sesion) => this.sesion.set(sesion));
  }

  async ingresar(email: string, password: string): Promise<string | null> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) {
      return error.message === 'Invalid login credentials'
        ? 'Usuario o contraseña incorrectos.'
        : 'No se pudo ingresar. Probá de nuevo.';
    }
    if (!(await this.esAdmin())) {
      await this.salir();
      return 'Este usuario no tiene permisos de administrador.';
    }
    return null;
  }

  // Chequea la tabla admins con la función es_admin() de la base
  async esAdmin(): Promise<boolean> {
    const { data, error } = await this.sb.rpc('es_admin');
    return !error && data === true;
  }

  async salir(): Promise<void> {
    await this.sb.auth.signOut();
  }
}
