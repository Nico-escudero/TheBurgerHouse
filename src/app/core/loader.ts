import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Loader principal: el HTML y los estilos están en index.html (se ven antes de que arranque Angular).
// Acá se maneja el progreso y la salida. Las animaciones del sitio esperan a `loaderListo`.
// Se muestra solo en la primera visita de la sesión: al recargar o volver, el sitio entra directo
// (index.html lo saca antes de que arranque la app si encuentra LOADER_VISTO en sessionStorage).

const MINIMO_MS = 700; // que se llegue a ver la marca aunque todo cargue al instante
const LOADER_VISTO = 'bh_loader_visto'; // misma clave que el script de index.html
const MAXIMO_MS = 5000; // si algo tarda demasiado, el sitio se muestra igual

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Espera a que la foto del hero esté en la página y terminada de cargar (o con error: complete = true).
// Se revisa cuadro a cuadro porque la imagen del HTML prerenderizado se reemplaza cuando arranca
// Angular: un listener de "load" sobre la imagen vieja podría no dispararse nunca.
async function fotoHero(): Promise<void> {
  for (;;) {
    const img = document.querySelector<HTMLImageElement>('.hero__photo img');
    if (img?.isConnected && img.complete) return;
    await new Promise(requestAnimationFrame);
  }
}

function terminar(loader: Element | null, cortina: Element | null): void {
  loader?.remove();
  cortina?.remove();
  document.documentElement.classList.remove('cargando');
  ScrollTrigger.refresh();
  try {
    sessionStorage.setItem(LOADER_VISTO, '1');
  } catch {
    /* modo privado sin storage: el loader se vuelve a mostrar, no pasa nada */
  }
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
  const avance = gsap.to(estado, { valor: 85, duration: 1.2, ease: 'power2.out', onUpdate: pintar });

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
          .to(estado, { valor: 100, duration: 0.3, ease: 'power2.inOut', onUpdate: pintar })
          // La carita da un salto y la marca se va hacia arriba
          .to('.loader__carita', { scale: 1.25, rotate: 25, duration: 0.18, ease: 'power2.out' })
          .to('.loader__carita', { scale: 0, rotate: 200, duration: 0.3, ease: 'back.in(2)' })
          .to(
            '.loader__marca, .loader__barra, .loader__pie',
            { yPercent: -60, autoAlpha: 0, duration: 0.3, stagger: 0.04, ease: 'power2.in' },
            '<',
          )
          // El negro sube y deja ver la cortina mostaza, que sube detrás y descubre el sitio
          .to(loader, { yPercent: -100, duration: 0.65, ease: 'power4.inOut' }, '-=0.1')
          .to(
            cortina,
            {
              yPercent: -100,
              duration: 0.65,
              ease: 'power4.inOut',
              // La entrada del sitio arranca mientras la cortina se va
              onStart: () => resolver(),
            },
            '-=0.5',
          );
      }),
  );
}

export const loaderListo: Promise<void> =
  typeof document === 'undefined' ? Promise.resolve() : correrLoader();
