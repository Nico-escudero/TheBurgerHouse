import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { loaderListo } from './loader';

gsap.registerPlugin(ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText };

// Movimiento reducido (iPhone "Reducir movimiento", Android "Quitar animaciones", ahorro de batería):
// el sitio sigue animado, pero con entradas suaves (fundidos) y sin parallax ni rebotes grandes.
const MOVIMIENTO = {
  reducido: '(prefers-reduced-motion: reduce)',
  normal: '(prefers-reduced-motion: no-preference)',
};

/**
 * Corre las animaciones de un componente cuando ya está en el DOM y terminó el loader,
 * con selectores limitados a `scope`, y las revierte al destruirse. Llamar en el constructor.
 * `crear` recibe `reducido = true` si el sistema pide menos movimiento: animar solo con fundidos.
 */
export function animar(
  scope: () => Element | undefined,
  crear: (reducido: boolean) => void | (() => void),
): void {
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
      // Se vuelve a crear si el usuario cambia el ajuste con la página abierta
      mm.add(MOVIMIENTO, (ctx) => crear(!!ctx.conditions?.['reducido']), el);
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
      (reducido) => {
        const grupo = this.appRevelar() === 'grupo';
        gsap.from(grupo ? el.children : el, {
          autoAlpha: 0,
          // Movimiento reducido: solo aparece (fundido), sin desplazarse ni girar
          y: reducido ? 0 : grupo ? 50 : 36,
          rotate: grupo || reducido ? 0 : 1.5,
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

// ===== Carrito y paneles =====

const sinMovimiento = (): boolean =>
  typeof matchMedia !== 'function' || matchMedia(MOVIMIENTO.reducido).matches;

const VUELO = 0.7; // segundos que tarda un producto en llegar al carrito
let llegadaVuelo = 0; // momento (ms) en que aterriza el último vuelo

/** Segundos que faltan para que aterrice el vuelo en curso: el rebote del carrito espera eso. */
export function esperaVuelo(): number {
  return Math.max(0, llegadaVuelo - performance.now()) / 1000;
}

/**
 * La carita de la marca sale del botón tocado y vuela en arco hasta el botón del carrito.
 * Va en el top layer (popover) para verse por encima de la ficha abierta.
 */
export function volarAlCarrito(origen: Element): void {
  const destino = document.querySelector('.site-nav__cart');
  if (sinMovimiento() || !destino) return;

  const desde = origen.getBoundingClientRect();
  const hasta = destino.getBoundingClientRect();
  const lado = 44; // arranca chica, centrada en el botón tocado
  const x0 = desde.left + desde.width / 2 - lado / 2;
  const y0 = desde.top + desde.height / 2 - lado / 2;

  const fantasma = document.createElement('img');
  fantasma.src = '/carita.svg';
  fantasma.alt = '';
  fantasma.setAttribute('aria-hidden', 'true');
  Object.assign(fantasma.style, {
    position: 'fixed',
    inset: 'auto',
    left: `${x0}px`,
    top: `${y0}px`,
    width: `${lado}px`,
    height: `${lado}px`,
    margin: '0',
    padding: '0',
    border: '0',
    background: 'none',
    overflow: 'visible',
    pointerEvents: 'none',
    zIndex: '1000',
    filter: 'drop-shadow(0 6px 12px rgba(0, 0, 0, .35))',
  });
  fantasma.popover = 'manual';
  document.body.appendChild(fantasma);
  fantasma.showPopover?.();

  const dx = hasta.left + hasta.width / 2 - (x0 + lado / 2);
  const dy = hasta.top + hasta.height / 2 - (y0 + lado / 2);
  llegadaVuelo = performance.now() + VUELO * 1000;

  // x e y con distinto ease dibujan el arco: primero se abre hacia el costado, después sube
  gsap
    .timeline({ onComplete: () => fantasma.remove() })
    .from(fantasma, { scale: 0.6, autoAlpha: 0, duration: 0.15, ease: 'power2.out' })
    .to(fantasma, { x: dx, duration: VUELO, ease: 'power1.out' }, 0)
    .to(fantasma, { y: dy, duration: VUELO, ease: 'back.in(1.4)' }, 0)
    .to(fantasma, { scale: 0.5, duration: VUELO - 0.15, ease: 'power2.in' }, 0.15)
    .to(fantasma, { rotate: 360, duration: VUELO, ease: 'power1.inOut' }, 0)
    .to(fantasma, { autoAlpha: 0, duration: 0.12 }, VUELO - 0.12);
}

/**
 * Animación de entrada del contenido de un panel recién abierto: los `items` aparecen escalonados.
 * La hoja en sí entra con CSS (keyframes en `[open]`).
 */
export function entrarPanel(items: ArrayLike<Element>): void {
  if (sinMovimiento() || !items.length) return;
  gsap.from(items, {
    autoAlpha: 0,
    y: 18,
    duration: 0.45,
    stagger: 0.05,
    delay: 0.12,
    ease: 'power3.out',
    clearProps: 'all',
  });
}

/**
 * Cierra un <dialog> con animación de salida: le pone la clase `cerrando`
 * (el CSS anima la hoja y el fondo) y recién al terminar lo cierra de verdad.
 */
export function cerrarDialogo(d: HTMLDialogElement): void {
  if (!d.open || d.classList.contains('cerrando')) return;
  d.classList.add('cerrando');
  const animacion = getComputedStyle(d).animationName;
  let listo = false;
  const terminar = () => {
    if (listo) return;
    listo = true;
    d.removeEventListener('animationend', alTerminar);
    // Si mientras tanto se volvió a abrir, no se cierra
    if (d.classList.contains('cerrando')) {
      d.classList.remove('cerrando');
      d.close();
    }
  };
  const alTerminar = (e: AnimationEvent) => {
    if (e.target === d) terminar();
  };
  if (!animacion || animacion === 'none') return terminar();
  d.addEventListener('animationend', alTerminar);
  setTimeout(terminar, 400); // respaldo si el navegador no dispara animationend
}

/**
 * Saca una fila del carrito con animación: se desliza a la derecha, se desvanece
 * y se pliega su alto para que las de abajo suban suave. Al final llama a `quitar`.
 */
export function borrarFila(fila: HTMLElement, quitar: () => void): void {
  if (fila.dataset['borrando']) return; // doble toque mientras sale
  fila.dataset['borrando'] = '1';
  if (sinMovimiento()) {
    gsap.to(fila, { autoAlpha: 0, duration: 0.15, onComplete: quitar });
    return;
  }
  gsap
    .timeline({ onComplete: quitar })
    .to(fila, { x: 60, autoAlpha: 0, duration: 0.25, ease: 'power2.in' })
    .to(fila, {
      height: 0,
      paddingTop: 0,
      paddingBottom: 0,
      borderBottomWidth: 0,
      duration: 0.25,
      ease: 'power2.inOut',
    });
}
