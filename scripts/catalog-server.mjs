import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createBenchmarkImage,
  createWorkloadScript,
} from './benchmark-workloads.mjs'

const catalogPath = resolve(process.env.CATALOG_FILE || 'data/products.json')
const feed = JSON.parse(await readFile(catalogPath, 'utf8'))
if (!Array.isArray(feed.products) || feed.products.length !== 12) {
  throw new Error(`Expected 12 products in ${catalogPath}`)
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const pathname = url.pathname
  if (pathname === '/health') {
    response.writeHead(200).end('ok')
    return
  }
  if (pathname === '/benchmark-assets/workload.js') {
    const script = createWorkloadScript(url.searchParams.get('workload'))
    if (!script) {
      response.writeHead(404).end('Unknown workload profile')
      return
    }
    response.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end(script)
    return
  }
  if (pathname === '/benchmark-assets/image.svg') {
    const image = createBenchmarkImage(
      url.searchParams.get('workload'),
      Number(url.searchParams.get('index')),
    )
    if (!image) {
      response.writeHead(404).end('Unknown workload image')
      return
    }
    response.writeHead(200, {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end(image)
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
