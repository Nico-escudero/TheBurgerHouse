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
import { RouterLink, RouterOutlet } from '@angular/router';

interface NavLink {
  label: string;
  id: string; // id de la <section> destino
}

// Alto de las nubes (::after del header): la sección arranca justo debajo, igual que el hero
const NUBES = 20;
const AIRE = 0;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
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
  protected readonly cantidadCarrito = signal(2);

  private readonly header = viewChild.required<ElementRef<HTMLElement>>('header');
  private readonly linksBar = viewChild.required<ElementRef<HTMLElement>>('linksBar');
  private frame = 0;

  // Alto real del header, medido en vivo (cambia entre desktop y mobile)
  private get navAlto(): number {
    return this.header().nativeElement.offsetHeight;
  }

  constructor() {
    const scroller = inject(ViewportScroller);

    // El router resta este offset al hacer scroll al fragment: el header sticky no tapa la sección
    scroller.setOffset(() => [0, this.navAlto + NUBES + AIRE]);

    afterNextRender(() => this.actualizarActivo());

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

  protected onScroll(): void {
    if (this.frame) return;
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
