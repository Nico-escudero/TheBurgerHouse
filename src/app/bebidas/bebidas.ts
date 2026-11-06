import { Component } from '@angular/core';
import { MenuCategoria } from '../menu-categoria/menu-categoria';

@Component({
  selector: 'app-bebidas',
  imports: [MenuCategoria],
  templateUrl: './bebidas.html',
  styleUrl: './bebidas.scss',
})
export class Bebidas {}
