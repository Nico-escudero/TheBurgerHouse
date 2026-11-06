import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  inject,
  input,
} from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { loaderListo } from './loader';

gsap.registerPlugin(ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText };

// Solo se anima si el usuario no pidió movimiento reducido
const CON_MOVIMIENTO = '(prefers-reduced-motion: no-preference)';

/**
 * Corre las animaciones de un componente cuando ya está en el DOM y terminó el loader,
 * con selectores limitados a `scope`, y las revierte al destruirse. Llamar en el constructor.
 */
export function animar(scope: () => Element | undefined, crear: () => void): void {
  const destroyRef = inject(DestroyRef);
  let destruido = false;
  let mm: gsap.MatchMedia | undefined;
  destroyRef.onDestroy(() => {
    destruido = true;
    mm?.revert();
  });
  afterNextRender(() => {
    loaderListo.then(() => {
      const el = scope();
      if (destruido || !el) return;
      mm = gsap.matchMedia();
      mm.add(CON_MOVIMIENTO, crear, el);
    });
  });
}

// Varias directivas aparecen juntas (menú que llega de Supabase): un solo refresh por frame
let refreshPendiente = 0;
function refrescarScroll(): void {
  if (refreshPendiente) return;
  refreshPendiente = requestAnimationFrame(() => {
    refreshPendiente = 0;
    ScrollTrigger.refresh();
  });
}

/**
 * Aparece al entrar en pantalla.
 * - `item`: el elemento sube y aparece (cards, filas, salsas).
 * - `grupo`: sus hijos aparecen escalonados (encabezados de sección).
 */
@Directive({ selector: '[appRevelar]' })
export class Revelar {
  readonly appRevelar = input<'item' | 'grupo' | ''>('');
  readonly indice = input(0); // posición en la grilla: desfasa un poco las columnas

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    animar(
      () => el,
      () => {
        const grupo = this.appRevelar() === 'grupo';
        gsap.from(grupo ? el.children : el, {
          autoAlpha: 0,
          y: grupo ? 50 : 36,
          rotate: grupo ? 0 : 1.5,
          duration: grupo ? 0.8 : 0.7,
          ease: 'power3.out',
          stagger: grupo ? 0.1 : 0,
          delay: grupo ? 0 : (this.indice() % 2) * 0.08,
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        });
        refrescarScroll();
      },
    );
  }
}
