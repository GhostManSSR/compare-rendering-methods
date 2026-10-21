import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import App from './App.vue'
import type { FeedData } from './types'

export function render(feed?: FeedData, mode = 'ssr') {
  const basePath = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')
  return renderToString(createSSRApp(App, { initialFeed: feed, mode, basePath }))
}
