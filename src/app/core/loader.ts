import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Loader principal: el HTML y los estilos están en index.html (se ven antes de que arranque Angular).
// Acá se maneja el progreso y la salida. Las animaciones del sitio esperan a `loaderListo`.

const MINIMO_MS = 1300; // que se llegue a ver la marca aunque todo cargue al instante
const MAXIMO_MS = 5000; // si algo tarda demasiado, el sitio se muestra igual

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Espera a que exista la foto del hero (la ruta se renderiza después de la app) y a que cargue
async function fotoHero(): Promise<void> {
  let img: HTMLImageElement | null = null;
  while (!(img = document.querySelector<HTMLImageElement>('.hero__photo img'))) {
    await new Promise(requestAnimationFrame);
  }
  if (img.complete) return;
  await new Promise<void>((r) => {
    img!.addEventListener('load', () => r(), { once: true });
    img!.addEventListener('error', () => r(), { once: true });
  });
}

function terminar(loader: Element | null, cortina: Element | null): void {
  loader?.remove();
  cortina?.remove();
  document.documentElement.classList.remove('cargando');
  ScrollTrigger.refresh();
}

function correrLoader(): Promise<void> {
  const loader = document.querySelector<HTMLElement>('.loader');
  const cortina = document.querySelector<HTMLElement>('.loader__cortina');
  if (!loader) return Promise.resolve();

  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const numero = loader.querySelector('.loader__numero');
  const progreso = loader.querySelector('.loader__progreso');
  const estado = { valor: 0 };
  const pintar = () => {
    if (numero) numero.textContent = String(Math.round(estado.valor));
    gsap.set(progreso, { scaleX: estado.valor / 100 });
  };

  // Mientras carga: avanza rápido al principio y se frena cerca del final
  const avance = gsap.to(estado, { valor: 85, duration: 2.2, ease: 'power2.out', onUpdate: pintar });

  // Entrada de la marca
  if (!sinMovimiento) {
    gsap.from('.loader__carita', { scale: 0, rotate: -90, duration: 0.7, ease: 'back.out(1.8)' });
    gsap.from('.loader__marca', { yPercent: 100, autoAlpha: 0, duration: 0.6, delay: 0.15, ease: 'power3.out' });
    gsap.from('.loader__pie', { autoAlpha: 0, duration: 0.6, delay: 0.3 });
  }

  const listo = Promise.all([document.fonts.ready, fotoHero(), espera(MINIMO_MS)]);

  return Promise.race([listo, espera(MAXIMO_MS)]).then(
    () =>
      new Promise<void>((resolver) => {
        avance.kill();

        if (sinMovimiento) {
          gsap.to([loader, cortina], {
            autoAlpha: 0,
            duration: 0.3,
            onComplete: () => {
              terminar(loader, cortina);
              resolver();
            },
          });
          return;
        }

        gsap
          .timeline({ onComplete: () => terminar(loader, cortina) })
          // Completa el 100%
          .to(estado, { valor: 100, duration: 0.45, ease: 'power2.inOut', onUpdate: pintar })
          // La carita da un salto y la marca se va hacia arriba
          .to('.loader__carita', { scale: 1.25, rotate: 25, duration: 0.25, ease: 'power2.out' })
          .to('.loader__carita', { scale: 0, rotate: 200, duration: 0.4, ease: 'back.in(2)' })
          .to(
            '.loader__marca, .loader__barra, .loader__pie',
            { yPercent: -60, autoAlpha: 0, duration: 0.4, stagger: 0.05, ease: 'power2.in' },
            '<',
          )
          // El negro sube y deja ver la cortina mostaza, que sube detrás y descubre el sitio
          .to(loader, { yPercent: -100, duration: 0.8, ease: 'power4.inOut' }, '-=0.1')
          .to(
            cortina,
            {
              yPercent: -100,
              duration: 0.8,
              ease: 'power4.inOut',
              // La entrada del sitio arranca mientras la cortina se va
              onStart: () => resolver(),
            },
            '-=0.6',
          );
      }),
  );
}

export const loaderListo: Promise<void> =
  typeof document === 'undefined' ? Promise.resolve() : correrLoader();
