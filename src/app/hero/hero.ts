import { Component } from '@angular/core';

// Marco ondulado: un "squircle" con 22 ondas en el borde, en coordenadas 0-1
function crearOnda(puntos = 240, ondas = 22, amplitud = 0.035): string {
  let d = '';
  for (let i = 0; i < puntos; i++) {
    const a = (i / puntos) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = 1 + amplitud * Math.sin(a * ondas);
    const x = 0.5 + 0.47 * Math.sign(c) * Math.sqrt(Math.abs(c)) * k;
    const y = 0.5 + 0.47 * Math.sign(s) * Math.sqrt(Math.abs(s)) * k;
    d += `${i ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`;
  }
  return d + 'Z';
}

@Component({
  selector: 'app-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  protected readonly onda = crearOnda();
}
