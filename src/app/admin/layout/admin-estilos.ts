import { Component, ViewEncapsulation } from '@angular/core';

// Carga una sola vez las clases .adm-* (campos, botones, paneles) para todo el dashboard.
// Sin encapsulación: las clases llegan a todas las pantallas del panel sin repetirse en cada componente.
@Component({
  selector: 'app-admin-estilos',
  template: '',
  styleUrl: '../../../styles/_admin.scss',
  encapsulation: ViewEncapsulation.None,
})
export class AdminEstilos {}
