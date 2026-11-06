import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

// Solo deja pasar a usuarios logueados que estén en la tabla admins
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.listo;
  // Sesión de más de 2 días (o la pestaña estuvo suspendida y no corrió el timer): se cierra
  if (auth.sesion() && auth.vencida()) await auth.salir();
  if (auth.sesion() && (await auth.esAdmin())) return true;
  return router.parseUrl('/admin/login');
};
