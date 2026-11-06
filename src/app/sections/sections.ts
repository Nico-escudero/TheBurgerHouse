import { Component, inject } from '@angular/core';
import { MenuService } from '../core/menu.service';
import { Hero } from '../hero/hero';
import { Marquee } from '../marquee/marquee';
import { Hambuergesas } from '../hambuergesas/hambuergesas';
import { Acompaniamientos } from '../acompaniamientos/acompaniamientos';
import { Extras } from '../extras/extras';
import { Postres } from '../postres/postres';
import { Bebidas } from '../bebidas/bebidas';
import { Salsas } from '../salsas/salsas';

@Component({
  selector: 'app-sections',
  imports: [Hero, Marquee, Hambuergesas, Acompaniamientos, Extras, Postres, Bebidas, Salsas],
  templateUrl: './sections.html',
  styleUrl: './sections.scss',
})
export class Sections {
  constructor() {
    // Trae el menú de Supabase (mientras tanto se muestra el guardado en localStorage, si hay)
    inject(MenuService).cargar();
  }
}
