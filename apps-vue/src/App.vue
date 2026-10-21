<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { FeedData } from './types'

const props = withDefaults(defineProps<{ initialFeed?: FeedData; mode?: string; basePath?: string }>(), {
  mode: 'csr',
  basePath: '',
})
const feed = ref(props.initialFeed)
const error = ref('')

async function loadFeed(): Promise<FeedData> {
  const response = await fetch(
    '/api/products?limit=12&select=id,title,description,price,rating,brand,category,thumbnail',
  )
  if (!response.ok) throw new Error(`Products API returned ${response.status}`)
  return response.json() as Promise<FeedData>
}

onMounted(async () => {
  if (feed.value) return
  try {
    feed.value = await loadFeed()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load products'
  }
})
</script>

<template>
  <main class="page">
    <header class="topbar">
      <a class="brand" :href="`${props.basePath}/csr`" aria-label="Market home">market<span>lab</span></a>
      <nav aria-label="Rendering modes">
        <a v-for="item in ['csr', 'ssr', 'ssg']" :key="item" :class="{ active: mode === item }" :href="`${props.basePath}/${item}`">
          {{ item.toUpperCase() }}
        </a>
      </nav>
      <span class="framework">Vue · {{ mode.toUpperCase() }}</span>
    </header>
    <section class="intro">
      <p class="eyebrow">TODAY'S PICKS · FREE DELIVERY</p>
      <h1>Find your next favorite.</h1>
      <p class="subtitle">Fresh finds from brands you'll love.</p>
    </section>
    <p v-if="error" class="error" role="alert">Could not load the catalog: {{ error }}</p>
    <p v-else-if="!feed" class="loading" aria-live="polite">Loading the catalog…</p>
    <section v-else class="catalog" aria-label="Marketplace products">
      <article v-for="(product, index) in feed.products" :key="product.id" class="card">
        <div class="image-wrap">
          <img
            :src="product.thumbnail"
            :alt="product.title"
            width="320"
            height="240"
            :loading="index === 0 ? 'eager' : 'lazy'"
            :fetchpriority="index === 0 ? 'high' : 'auto'"
          >
          <span v-if="index === 0" class="badge">BESTSELLER</span>
        </div>
        <div class="card-info">
          <p class="category">{{ product.category }}</p>
          <h2>{{ product.title }}</h2>
          <p class="description">{{ product.description }}</p>
          <div class="card-bottom">
            <strong>${{ product.price.toFixed(2) }}</strong>
            <span class="rating">★ {{ product.rating.toFixed(1) }}</span>
          </div>
        </div>
      </article>
    </section>
    <footer>Same catalog, same images, same viewport — only the render strategy changes.</footer>
  </main>
</template>
