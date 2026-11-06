import { Component, ElementRef, inject } from '@angular/core';
import { Revelar, animar, gsap } from '../core/animaciones';
import { MenuService } from '../core/menu.service';

@Component({
  selector: 'app-salsas',
  imports: [Revelar],
  templateUrl: './salsas.html',
  styleUrl: './salsas.scss',
})
export class Salsas {
  protected readonly menu = inject(MenuService);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    // Caritas de fondo: giran y se desplazan a distinto ritmo mientras se scrollea
    animar(
      () => host,
      (reducido) => {
        if (reducido) return; // parallax: no se usa con movimiento reducido
        const scroll = { trigger: host, start: 'top bottom', end: 'bottom top', scrub: 1 };
        gsap.fromTo(
          '.salsas__carita--grande',
          { y: 80, rotate: -20 },
          { y: -80, rotate: 25, ease: 'none', scrollTrigger: scroll },
        );
        gsap.fromTo(
          '.salsas__carita--chica',
          { y: -40, rotate: 15 },
          { y: 120, rotate: -40, ease: 'none', scrollTrigger: { ...scroll } },
        );
      },
    );
  }
}
