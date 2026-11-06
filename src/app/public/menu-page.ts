import { Component, inject, OnInit } from '@angular/core';
import { MenuService } from '../core/menu.service';

@Component({
    selector: 'app-menu-page',
    template: `
    @if (menu.cargando()) {
      <p>Cargando…</p>
    } @else if (menu.error()) {
      <p>No pudimos cargar el menú. Probá de nuevo en un rato.</p>
    }

    @for (cat of menu.categorias(); track cat.id) {
      <h2>{{ cat.nombre }}</h2>
      <ul>
        @for (p of cat.productos; track p.id) {
          <li>
            {{ p.nombre }} — {{ precio(p.precio) }}
            @if (p.precio_con_papas) { (con papas {{ precio(p.precio_con_papas) }}) }
            @if (!p.stock) { <strong>SIN STOCK</strong> }
          </li>
        }
      </ul>
    }

    <h2>Salsas</h2>
    <ul>
      @for (s of menu.salsas(); track s.id) {
        <li>{{ s.nombre }}: {{ s.descripcion }}</li>
      }
    </ul>
  `,
})
export class MenuPage implements OnInit {
    readonly menu = inject(MenuService);

    ngOnInit(): void {
        this.menu.cargar();
    }

    precio(n: number): string {
        return '$' + n.toLocaleString('es-AR');
    }
}