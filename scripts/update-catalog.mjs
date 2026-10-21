import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const url = 'https://dummyjson.com/products?limit=12&select=id,title,description,price,rating,brand,category,thumbnail'
const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
if (!response.ok) throw new Error(`DummyJSON returned HTTP ${response.status}`)

const feed = await response.json()
if (!Array.isArray(feed.products) || feed.products.length !== 12) {
  throw new Error(`Expected 12 products; received ${feed.products?.length ?? 0}`)
}

const outputPath = resolve('data/products.json')
await mkdir(resolve('data'), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(feed, null, 2)}\n`)
console.log(`Updated fixed catalog snapshot: ${outputPath}`)
