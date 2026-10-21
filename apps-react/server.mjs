import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from './dist/server/entry-server.js'

const root = fileURLToPath(new URL('./dist/client/', import.meta.url))
const apiUrl = process.env.CATALOG_API_URL || 'https://dummyjson.com/products?limit=12&select=id,title,description,price,rating,brand,category,thumbnail'
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
}

async function getFeed() {
  const response = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Products API returned ${response.status}`)
  return response.json()
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function withMarkup(template, markup, feed) {
  const serialized = feed
    ? `<script>window.__INITIAL_FEED__=${safeJson(feed)}</script>`
    : ''
  return template
    .replace('<!--app-html-->', markup)
    .replace('</body>', `${serialized}</body>`)
}

async function sendFile(path, response) {
  const body = await readFile(path)
  response.writeHead(200, {
    'content-type': mime[extname(path)] || 'application/octet-stream',
    'cache-control': extname(path) === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  response.end(body)
}

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  try {
    if (pathname === '/api/products') {
      const apiResponse = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) })
      response.writeHead(apiResponse.status, { 'content-type': 'application/json; charset=utf-8' })
      response.end(await apiResponse.text())
      return
    }

    if (pathname === '/ssg') {
      await sendFile(resolve(root, 'ssg.html'), response)
      return
    }

    if (pathname === '/ssr') {
      const feed = await getFeed()
      const template = await readFile(resolve(root, 'index.html'), 'utf8')
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      response.end(withMarkup(template, render(feed), feed))
      return
    }

    if (pathname === '/' || pathname === '/csr') {
      await sendFile(resolve(root, 'index.html'), response)
      return
    }

    const path = resolve(root, `.${pathname}`)
    if (!path.startsWith(root)) {
      response.writeHead(400).end('Invalid path')
      return
    }
    if ((await stat(path)).isFile()) {
      await sendFile(path, response)
      return
    }
    response.writeHead(404).end('Not found')
  } catch (error) {
    console.error(error)
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(error instanceof Error ? error.message : 'Request failed')
  }
})

const port = Number(process.env.PORT || 5173)
server.listen(port, '0.0.0.0', () => console.log(`React benchmark: http://localhost:${port}`))
