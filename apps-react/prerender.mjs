import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { render } from './dist/server/entry-server.js'

const apiUrl = 'https://dummyjson.com/products?limit=12&select=id,title,description,price,rating,brand,category,thumbnail'
const feed = process.env.CATALOG_FILE
  ? JSON.parse(await readFile(process.env.CATALOG_FILE, 'utf8'))
  : await fetch(apiUrl, { signal: AbortSignal.timeout(15000) }).then(async (response) => {
      if (!response.ok) throw new Error(`Products API returned ${response.status}`)
      return response.json()
    })
const root = resolve('dist/client')
const template = await readFile(resolve(root, 'index.html'), 'utf8')
const json = JSON.stringify(feed).replaceAll('<', '\\u003c')
const html = template
  .replace('<!--app-html-->', render(feed, 'ssg'))
  .replace('</body>', `<script>window.__INITIAL_FEED__=${json}</script></body>`)
await mkdir(root, { recursive: true })
await writeFile(resolve(root, 'ssg.html'), html)
console.log(`Pre-rendered ${feed.products.length} products to dist/client/ssg.html`)
