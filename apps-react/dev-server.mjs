import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createServer as createViteServer } from 'vite'

const apiUrl = 'https://dummyjson.com/products?limit=12&select=id,title,description,price,rating,brand,category,thumbnail'
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
})

async function getFeed() {
  const response = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Products API returned ${response.status}`)
  return response.json()
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

async function renderPage(mode, request, response) {
  const { render } = await vite.ssrLoadModule('/src/entry-server.tsx')
  const feed = mode === 'csr' ? undefined : mode === 'ssg' ? staticFeed : await getFeed()
  const markup = feed ? render(feed, mode) : ''
  const serialized = feed ? `<script>window.__INITIAL_FEED__=${safeJson(feed)}</script>` : ''
  const template = await readFile(new URL('./index.html', import.meta.url), 'utf8')
  const html = await vite.transformIndexHtml(
    request.url,
    template.replace('<!--app-html-->', markup).replace('</body>', `${serialized}</body>`),
  )
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(html)
}

let staticFeed
try {
  staticFeed = await getFeed()
} catch (error) {
  await vite.close()
  throw error
}

const server = createHttpServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (['/', '/csr', '/ssr', '/ssg'].includes(pathname)) {
    const mode = pathname.slice(1) || 'csr'
    renderPage(mode, request, response).catch((error) => {
      vite.ssrFixStacktrace(error)
      console.error(error)
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(error instanceof Error ? error.message : 'Rendering failed')
    })
    return
  }
  vite.middlewares(request, response, () => response.writeHead(404).end('Not found'))
})

const port = Number(process.env.PORT || 5173)
server.listen(port, '0.0.0.0', () => console.log(`React dev benchmark: http://localhost:${port}`))
