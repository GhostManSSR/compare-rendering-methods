import { inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ResolveFn } from '@angular/router';
import { of } from 'rxjs';

export type Product = {
  id: number;
  title: string;
  description: string;
  price: number;
  rating: number;
  brand: string;
  category: string;
  thumbnail: string;
};

export type FeedData = { products: Product[] };

export const productApi =
  'https://dummyjson.com/products?limit=12&select=id,title,description,price,rating,brand,category,thumbnail';

export const PRODUCT_API_URL = new InjectionToken<string>('PRODUCT_API_URL', {
  providedIn: 'root',
  factory: () => '/api/products?limit=12&select=id,title,description,price,rating,brand,category,thumbnail',
});

export const PRERENDER_FEED = new InjectionToken<FeedData | null>('PRERENDER_FEED', {
  providedIn: 'root',
  factory: () => null,
});

export const productsResolver: ResolveFn<FeedData> = () => {
  const prerenderFeed = inject(PRERENDER_FEED);
  if (prerenderFeed) return of(prerenderFeed);
  return inject(HttpClient).get<FeedData>(
    inject(PRODUCT_API_URL, { optional: true }) ?? productApi,
  );
};
