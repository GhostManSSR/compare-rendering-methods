import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const catalogPath = resolve(process.env.CATALOG_FILE || 'data/products.json')
const feed = JSON.parse(await readFile(catalogPath, 'utf8'))
if (!Array.isArray(feed.products) || feed.products.length !== 12) {
  throw new Error(`Expected 12 products in ${catalogPath}`)
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (pathname === '/health') {
    response.writeHead(200).end('ok')
    return
  }
  if (pathname !== '/products' && pathname !== '/api/products') {
    response.writeHead(404).end('Not found')
    return
  }
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(feed))
})

const port = Number(process.env.PORT || 3000)
server.listen(port, '0.0.0.0', () => {
  console.log(`Catalog fixture: ${feed.products.length} products on port ${port}`)
})
