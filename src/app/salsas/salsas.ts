import { Component, inject } from '@angular/core';
import { MenuService } from '../core/menu.service';

@Component({
  selector: 'app-salsas',
  imports: [],
  templateUrl: './salsas.html',
  styleUrl: './salsas.scss',
})
export class Salsas {
  protected readonly menu = inject(MenuService);
}
