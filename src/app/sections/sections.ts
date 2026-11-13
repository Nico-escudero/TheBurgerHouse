import { Component, ElementRef, inject } from '@angular/core';
import { animar, gsap } from '../core/animaciones';
import { MenuService } from '../core/menu.service';
import { Hero } from '../hero/hero';
import { Marquee } from '../marquee/marquee';
import { Hambuergesas } from '../hambuergesas/hambuergesas';
import { Acompaniamientos } from '../acompaniamientos/acompaniamientos';
import { Extras } from '../extras/extras';
import { Postres } from '../postres/postres';
import { Bebidas } from '../bebidas/bebidas';
import { Salsas } from '../salsas/salsas';
import { Ubicacion } from '../ubicacion/ubicacion';

@Component({
  selector: 'app-sections',
  imports: [Hero, Marquee, Hambuergesas, Acompaniamientos, Extras, Postres, Bebidas, Salsas, Ubicacion],
  templateUrl: './sections.html',
  styleUrl: './sections.scss',
})
export class Sections {
  constructor() {
    // Trae el menú de Supabase (mientras tanto se muestra el guardado en localStorage, si hay)
    inject(MenuService).cargar();

    // La franja del marquee entra barriendo desde la izquierda (el texto ya corre por CSS)
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    animar(
      () => host,
      () => {
        // clip-path en vez de scaleX: el texto tiene animación CSS y escalarlo lo deja borroso
        gsap.fromTo(
          'section.marquee',
          { clipPath: 'inset(-20% 100% -20% 0%)' },
          {
            clipPath: 'inset(-20% 0% -20% 0%)',
            clearProps: 'clipPath',
            duration: 0.9,
            delay: 0.5,
            ease: 'power4.out',
          },
        );
      },
    );
  }
}
