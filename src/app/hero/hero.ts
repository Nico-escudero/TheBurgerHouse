import { Component, ElementRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SplitText, animar, gsap } from '../core/animaciones';

// Marco ondulado: un "squircle" con 22 ondas en el borde, en coordenadas 0-1
function crearOnda(puntos = 240, ondas = 22, amplitud = 0.035): string {
  let d = '';
  for (let i = 0; i < puntos; i++) {
    const a = (i / puntos) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = 1 + amplitud * Math.sin(a * ondas);
    const x = 0.5 + 0.47 * Math.sign(c) * Math.sqrt(Math.abs(c)) * k;
    const y = 0.5 + 0.47 * Math.sign(s) * Math.sqrt(Math.abs(s)) * k;
    d += `${i ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`;
  }
  return d + 'Z';
}

@Component({
  selector: 'app-hero',
  imports: [RouterLink],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  protected readonly onda = crearOnda();

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    // Las caritas, el sello y .hero__media ya tienen animaciones CSS (transform):
    // acá solo se tocan sus contenedores o su opacidad, para no pisarlas.
    animar(
      () => host,
      (reducido) => {
        // Movimiento reducido: la misma secuencia, pero todo aparece con fundidos (sin desplazarse)
        const m = reducido ? 0 : 1;

        // Entrada: el título sube palabra por palabra desde una máscara
        const titulo = SplitText.create('.hero__title', { type: 'words', mask: 'words' });
        // La máscara recorta lo que sobresale: se agranda hacia arriba para que entren las tildes (Í)
        gsap.set(titulo.masks, { paddingTop: '0.2em', marginTop: '-0.2em' });

        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from('.hero__badge', { autoAlpha: 0, y: -16 * m, scale: reducido ? 1 : 0.9, duration: 0.5 }, 0.2)
          .from(
            titulo.words,
            reducido
              ? { autoAlpha: 0, duration: 0.6, stagger: 0.07 }
              : { yPercent: 110, duration: 0.8, stagger: 0.07 },
            0.3,
          )
          .from('.hero__subtitle', { autoAlpha: 0, y: 20 * m, duration: 0.6 }, '-=0.45')
          .from(
            '.hero__button',
            reducido
              ? { autoAlpha: 0, duration: 0.5 }
              : { autoAlpha: 0, scale: 0.6, duration: 0.7, ease: 'back.out(2)' },
            '-=0.35',
          )
          .from(
            '.hero__visual',
            {
              // Sin scale/rotate: adentro hay animaciones CSS de transform y Chrome fija su
              // resolución al arrancar; escalar el contenedor deja los SVG borrosos
              autoAlpha: 0,
              y: 60 * m,
              duration: 1,
              ease: 'power3.out',
              force3D: false,
              clearProps: 'transform',
            },
            0.35,
          )
          .from('.hero__saludo', { autoAlpha: 0, duration: 0.8 }, 0.9);

        // Al scrollear: el texto se va antes que la foto (parallax suave)
        const salida = { trigger: host, start: 'top top', end: 'bottom top', scrub: true };
        // Solo en desktop y sin movimiento reducido: en mobile el texto, la foto y los SVG quedan fijos
        if (!reducido) gsap.matchMedia().add('(min-width: 768px)', () => {
          gsap.to('.hero__texto', { y: -60, ease: 'none', scrollTrigger: salida });
          gsap.to('.hero__visual', {
            y: 70,
            ease: 'none',
            force3D: false,
            scrollTrigger: { ...salida },
          });
        });

        // El botón "rebota" un poco al pasar el mouse
        const boton = host.querySelector<HTMLElement>('.hero__button');
        const flecha = boton?.querySelector('svg');
        if (boton && flecha) {
          const hover = gsap.to(flecha, { x: 6, duration: 0.25, ease: 'power2.out', paused: true });
          boton.addEventListener('mouseenter', () => hover.play());
          boton.addEventListener('mouseleave', () => hover.reverse());
        }

        return () => titulo.revert();
      },
    );
  }
}
