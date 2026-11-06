import { ViewportScroller } from '@angular/common';
import {
  Component,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Carrito } from './carrito/carrito';
import { CarritoService } from './core/carrito.service';
import { Ficha } from './ficha/ficha';
import { SplitText, animar, gsap } from './core/animaciones';

interface NavLink {
  label: string;
  id: string; // id de la <section> destino
}

// Alto de las nubes (::after del header): la sección arranca justo debajo, igual que el hero
const NUBES = 20;
const AIRE = 0;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, Carrito, Ficha],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(window:scroll)': 'onScroll()' },
})
export class App {
  protected readonly title = signal('TheBurgerHouse');

  // Completar label e id de cada sección
  protected readonly links: NavLink[] = [
    { label: 'Burgers', id: 'hamburgesas' },
    { label: 'Acompañamientos', id: 'acompaniamientos' },
    { label: 'Extras', id: 'extras' },
    { label: 'Postres', id: 'postres' },
    { label: 'Bebidas', id: 'bebidas' },
    { label: 'Salsas', id: 'salsas' },
  ];

  // id de la <section> del hero: destino del logo, sin link resaltado
  protected readonly HERO = 'inicio';

  protected readonly activo = signal(this.HERO);
  protected readonly carrito = inject(CarritoService);
  protected readonly cantidadCarrito = this.carrito.cantidadTotal;

  // En /admin no se muestra el header/footer/carrito del sitio
  protected readonly enAdmin = toSignal(
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects.startsWith('/admin')),
    ),
    { initialValue: location.pathname.startsWith('/admin') },
  );

  private readonly header = viewChild<ElementRef<HTMLElement>>('header');
  private readonly linksBar = viewChild<ElementRef<HTMLElement>>('linksBar');
  private readonly badge = viewChild<ElementRef<HTMLElement>>('badge');
  private readonly cartBtn = viewChild<ElementRef<HTMLElement>>('cartBtn');
  private readonly footer = viewChild<ElementRef<HTMLElement>>('footer');
  private frame = 0;

  // Alto real del header, medido en vivo (cambia entre desktop y mobile)
  private get navAlto(): number {
    return this.header()?.nativeElement.offsetHeight ?? 0;
  }

  constructor() {
    const scroller = inject(ViewportScroller);

    // El router resta este offset al hacer scroll al fragment: el header sticky no tapa la sección
    scroller.setOffset(() => [0, this.navAlto + NUBES + AIRE]);

    afterNextRender(() => this.actualizarActivo());

    this.animarSitio();

    // Mobile: centra el link activo dentro de la barra deslizable
    effect(() => {
      const id = this.activo();
      const barra = this.linksBar()?.nativeElement;
      if (id === this.HERO) {
        barra?.scrollTo({ left: 0, behavior: 'smooth' }); // en el hero la barra vuelve al inicio
        return;
      }
      const link = barra?.querySelector<HTMLElement>(`[data-id="${id}"]`);
      if (!barra || !link || barra.scrollWidth <= barra.clientWidth) return;
      barra.scrollTo({
        left: link.offsetLeft - (barra.clientWidth - link.offsetWidth) / 2,
        behavior: 'smooth',
      });
    });
  }

  // Animaciones GSAP del sitio público: entrada del header, footer y rebote del carrito
  private animarSitio(): void {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    animar(
      () => host,
      () => {
        const header = this.header()?.nativeElement;
        if (header) {
          gsap.from(header, { yPercent: -120, duration: 0.8, ease: 'power3.out' });
          gsap.from(header.querySelectorAll('.site-nav__link'), {
            autoAlpha: 0,
            y: -12,
            duration: 0.4,
            stagger: 0.05,
            delay: 0.35,
            ease: 'power2.out',
          });
        }

        // Footer: las letras del nombre suben una a una al llegar al final
        const titulo = this.footer()?.nativeElement.querySelector('.footer__big');
        if (!titulo) return;
        const letras = SplitText.create(titulo, { type: 'chars', mask: 'chars' });
        gsap.from(letras.chars, {
          yPercent: 100,
          duration: 0.6,
          stagger: 0.025,
          ease: 'back.out(1.6)',
          scrollTrigger: { trigger: titulo, start: 'top 95%', once: true },
        });
        return () => letras.revert();
      },
    );

    // Rebote del carrito cada vez que cambia la cantidad (no en la carga inicial)
    const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
    let anterior = this.cantidadCarrito();
    effect(() => {
      const cantidad = this.cantidadCarrito();
      const boton = this.cartBtn()?.nativeElement;
      const badge = this.badge()?.nativeElement;
      if (cantidad === anterior || sinMovimiento.matches) {
        anterior = cantidad;
        return;
      }
      const sube = cantidad > anterior;
      anterior = cantidad;
      if (boton) {
        gsap.fromTo(
          boton,
          { rotate: sube ? -14 : 10 },
          { rotate: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.4)', overwrite: true },
        );
      }
      if (badge) {
        gsap.fromTo(
          badge,
          { scale: sube ? 1.6 : 0.7 },
          { scale: 1, duration: 0.5, ease: 'back.out(3)', overwrite: true },
        );
      }
    });
  }

  protected onScroll(): void {
    if (this.frame || this.enAdmin()) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.actualizarActivo();
    });
  }

  // Scroll spy: marca el link de la sección que está debajo del header
  private actualizarActivo(): void {
    const limite = this.navAlto + NUBES + AIRE + 1;
    const secciones = [this.HERO, ...this.links.map((l) => l.id)]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!secciones.length) return;

    let actual = secciones[0].id;
    for (const el of secciones) {
      if (el.getBoundingClientRect().top <= limite) actual = el.id;
    }

    // Al final de la página, la última sección queda activa aunque sea corta
    const alFondo =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (alFondo) actual = secciones[secciones.length - 1].id;

    this.activo.set(actual);
  }
}
