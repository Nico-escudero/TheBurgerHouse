import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { MenuService } from '../core/menu.service';

interface Turno {
  dias: string;
  horas: string;
}

// Horario de atención: miércoles a domingo, 20:00 a 23:30 (igual que el schema de index.html)
const DIAS_ABIERTO = [0, 3, 4, 5, 6]; // getDay(): 0 = domingo
const ABRE = 20 * 60; // minutos desde las 00:00
const CIERRA = 23 * 60 + 30;

// Respaldos si la base todavía no cargó la configuración
const WHATSAPP_RESPALDO = '5492494001424';
const DIRECCION_RESPALDO = 'Maipú 1712';

@Component({
  selector: 'app-ubicacion',
  templateUrl: './ubicacion.html',
  styleUrl: './ubicacion.scss',
})
export class Ubicacion {
  private readonly menu = inject(MenuService);

  protected readonly turnos: Turno[] = [
    { dias: 'Miércoles a domingo', horas: '20:00 a 23:30' },
    { dias: 'Lunes y martes', horas: 'Cerrado' },
  ];

  protected readonly direccion = computed(
    () => this.menu.config()['direccion'] || DIRECCION_RESPALDO,
  );

  protected readonly whatsapp = computed(() =>
    (this.menu.config()['whatsapp'] || WHATSAPP_RESPALDO).replace(/\D/g, ''),
  );

  // 5492494001424 → +54 9 249 400-1424
  protected readonly telefono = computed(() => {
    const n = this.whatsapp();
    const m = n.match(/^54(9)?(\d{3})(\d{3})(\d{4})$/);
    return m ? `+54 ${m[1] ? '9 ' : ''}${m[2]} ${m[3]}-${m[4]}` : `+${n}`;
  });

  protected readonly linkWhatsApp = computed(
    () =>
      `https://wa.me/${this.whatsapp()}?text=${encodeURIComponent('¡Hola! Tengo una consulta')}`,
  );

  protected readonly linkComoLlegar =
    'https://www.google.com/maps/dir/?api=1&destination=' +
    encodeURIComponent('The Burger House, Maipú 1712, Tandil, Buenos Aires');

  // Abierto / cerrado: solo en el navegador (en el prerender quedaría fija la hora del build)
  protected readonly abierto = signal<boolean | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.abierto.set(this.estaAbierto());
      const id = setInterval(() => this.abierto.set(this.estaAbierto()), 60_000);
      destroyRef.onDestroy(() => clearInterval(id));
    });
  }

  // Hora de Argentina, sin importar la zona horaria del dispositivo
  private estaAbierto(): boolean {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const valor = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
    const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(valor('weekday'));
    const minutos = Number(valor('hour')) * 60 + Number(valor('minute'));
    return DIAS_ABIERTO.includes(dia) && minutos >= ABRE && minutos < CIERRA;
  }
}
