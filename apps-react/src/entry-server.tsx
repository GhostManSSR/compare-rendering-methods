import { renderToString } from 'react-dom/server'
import { App, type FeedData } from './App'

export function render(feed?: FeedData, mode = 'ssr') {
  const basePath = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')
  return renderToString(<App initialFeed={feed} mode={mode} basePath={basePath} />)
}
