import { Component } from '@angular/core';

@Component({
  selector: 'app-hambuergesas',
  imports: [],
  templateUrl: './hambuergesas.html',
  styleUrl: './hambuergesas.scss',
})
export class Hambuergesas {
  // Si la foto no carga, se oculta y queda visible el placeholder con la carita (fondo de .foto)
  ocultarImagen(evento: Event) {
    (evento.target as HTMLImageElement).hidden = true;
  }
}
