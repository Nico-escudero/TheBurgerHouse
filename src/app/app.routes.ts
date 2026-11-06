import { Routes } from '@angular/router';
import { Sections } from './sections/sections';

export const routes: Routes = [
    { path: '', component: Sections },
    // Dashboard: se descarga aparte, solo cuando alguien entra a /admin
    { path: 'admin', loadChildren: () => import('./admin/admin.routes') },
    { path: '**', redirectTo: '' },
];
