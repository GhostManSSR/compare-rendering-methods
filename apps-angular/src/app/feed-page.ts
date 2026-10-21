import { Component, inject, OnInit, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { FeedData, PRODUCT_API_URL, Product } from './products';

@Component({
  selector: 'app-feed-page',
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './feed-page.html',
})
export class FeedPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly productApiUrl = inject(PRODUCT_API_URL);
  readonly mode = this.route.routeConfig?.path ?? 'csr';
  readonly products = signal<Product[]>([]);
  readonly error = signal('');

  ngOnInit(): void {
    const feed = this.route.snapshot.data['feed'] as FeedData | undefined;
    if (feed) {
      this.products.set(feed.products);
      return;
    }

    this.http.get<FeedData>(this.productApiUrl).subscribe({
      next: (feedData) => this.products.set(feedData.products),
      error: (cause: unknown) =>
        this.error.set(cause instanceof Error ? cause.message : 'Unable to load products'),
    });
  }
}
