import { Routes } from '@angular/router';
import { MenuPage } from './public/menu-page';
import { Sections } from './sections/sections';

export const routes: Routes = [
    { path: '', component: Sections },
    { path: '**', redirectTo: '' },
];