import { Component } from '@angular/core';

@Component({
  selector: 'app-marquee',
  imports: [],
  templateUrl: './marquee.html',
  styleUrl: './marquee.scss',
})
export class Marquee {
  readonly grupos = Array(2);
  readonly items = Array(5); // por grupo: más ancho que la pantalla más grande

}
