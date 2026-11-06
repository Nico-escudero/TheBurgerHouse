import { Routes } from '@angular/router';
import { adminGuard } from './admin.guard';

// Avisa si se sale del editor con cambios sin guardar
const confirmarSalida = (c: { puedeSalir(): boolean }) => c.puedeSalir();

export default [
  { path: 'login', loadComponent: () => import('./login/login').then((m) => m.Login) },
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'productos' },
      {
        path: 'productos',
        loadComponent: () => import('./productos/productos-admin').then((m) => m.ProductosAdmin),
      },
      {
        path: 'productos/nuevo',
        loadComponent: () => import('./editor/producto-editor').then((m) => m.ProductoEditor),
        canDeactivate: [confirmarSalida],
      },
      {
        path: 'productos/:id',
        loadComponent: () => import('./editor/producto-editor').then((m) => m.ProductoEditor),
        canDeactivate: [confirmarSalida],
      },
      {
        path: 'salsas',
        loadComponent: () => import('./salsas/salsas-admin').then((m) => m.SalsasAdmin),
      },
      {
        path: 'ajustes',
        loadComponent: () => import('./ajustes/ajustes').then((m) => m.Ajustes),
      },
    ],
  },
] satisfies Routes;
