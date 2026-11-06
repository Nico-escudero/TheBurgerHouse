import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withRouterConfig } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // habilita el scroll a la <section> del fragment (#burgers, #postres...)
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      // permite volver a la misma sección si el link ya está en la URL
      withRouterConfig({ onSameUrlNavigation: 'reload' }),
    ),
  ],
};
