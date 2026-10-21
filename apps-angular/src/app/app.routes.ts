import { Routes } from '@angular/router';
import { FeedPage } from './feed-page';
import { productsResolver } from './products';

export const routes: Routes = [
  { path: 'csr', component: FeedPage },
  { path: 'ssr', component: FeedPage, resolve: { feed: productsResolver } },
  { path: 'ssg', component: FeedPage, resolve: { feed: productsResolver } },
  { path: '', pathMatch: 'full', redirectTo: 'csr' },
  { path: '**', redirectTo: 'csr' },
];
