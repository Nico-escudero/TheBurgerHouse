import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

// La sesión del dashboard vence a los 2 días de haber ingresado (después hay que volver a loguearse)
const DURACION_MS = 2 * 24 * 60 * 60 * 1000;
const INGRESO_KEY = 'bh_admin_ingreso'; // fecha (ms) del último login

// Sesión del dashboard (usuarios creados en Supabase Auth + tabla admins)
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService).client;
  private readonly router = inject(Router);

  readonly sesion = signal<Session | null>(null);

  // Se resuelve cuando Supabase terminó de leer la sesión guardada
  readonly listo: Promise<void>;

  private timerVencimiento?: ReturnType<typeof setTimeout>;

  constructor() {
    this.listo = this.sb.auth.getSession().then(async ({ data }) => {
      this.sesion.set(data.session);
      if (data.session && this.vencida()) await this.salir();
    });
    this.sb.auth.onAuthStateChange((evento, sesion) => {
      this.sesion.set(sesion);
      if (evento === 'SIGNED_OUT') localStorage.removeItem(INGRESO_KEY);
      this.programarVencimiento();
    });
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
    localStorage.setItem(INGRESO_KEY, String(Date.now()));
    this.programarVencimiento();
    return null;
  }

  // Chequea la tabla admins con la función es_admin() de la base
  async esAdmin(): Promise<boolean> {
    const { data, error } = await this.sb.rpc('es_admin');
    return !error && data === true;
  }

  async salir(): Promise<void> {
    localStorage.removeItem(INGRESO_KEY);
    await this.sb.auth.signOut();
  }

  // Sin fecha de ingreso (sesiones de antes de este cambio) también cuenta como vencida
  vencida(): boolean {
    const ingreso = Number(localStorage.getItem(INGRESO_KEY));
    return !ingreso || Date.now() - ingreso >= DURACION_MS;
  }

  // Si el panel queda abierto, cierra la sesión justo cuando vence y vuelve al login
  private programarVencimiento(): void {
    clearTimeout(this.timerVencimiento);
    const ingreso = Number(localStorage.getItem(INGRESO_KEY));
    if (!this.sesion() || !ingreso) return;
    const resta = ingreso + DURACION_MS - Date.now();
    // setTimeout no acepta más de ~24,8 días; con 2 días no hay problema
    this.timerVencimiento = setTimeout(async () => {
      await this.salir();
      if (this.router.url.startsWith('/admin')) this.router.navigateByUrl('/admin/login');
    }, Math.max(resta, 0));
  }
}
