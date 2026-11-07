import { Routes } from '@angular/router';
import { Sections } from './sections/sections';

export const routes: Routes = [
    { path: '', component: Sections },
    // Dashboard: se descarga aparte, solo cuando alguien entra a /admin
    // Seguimiento de pedidos: buscar por número (/pedido) o link del WhatsApp (/pedido/:codigo)
    { path: 'pedido', loadComponent: () => import('./pedido/seguimiento').then((m) => m.Seguimiento) },
    {
        path: 'pedido/:codigo',
        loadComponent: () => import('./pedido/seguimiento').then((m) => m.Seguimiento),
    },
    { path: 'admin', loadChildren: () => import('./admin/admin.routes') },
    { path: '**', redirectTo: '' },
];
