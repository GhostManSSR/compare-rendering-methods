import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { readFileSync } from 'node:fs';
import { PRERENDER_FEED, PRODUCT_API_URL, productApi } from './products';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    {
      provide: PRODUCT_API_URL,
      useFactory: () => process.env['CATALOG_API_URL'] ?? productApi,
    },
    {
      provide: PRERENDER_FEED,
      useFactory: () => {
        const file = process.env['CATALOG_FILE'];
        return file ? JSON.parse(readFileSync(file, 'utf8')) : null;
      },
    },
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
