const baseUrl = (process.env.BENCHMARK_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '')
const timeoutMs = Number(process.env.BENCHMARK_STARTUP_TIMEOUT_MS || 120000)
const startedAt = Date.now()

async function request(path, retryUnavailable = false) {
  while (true) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5000) })
      if (!retryUnavailable || ![502, 503, 504].includes(response.status)) return response
      await response.body?.cancel()
    } catch (error) {
      if (!retryUnavailable) throw error
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for ${path} to become available`)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
  }
}

async function waitForServer() {
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await request('/health')
      if (response.ok) return
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
    }
  }
  throw new Error(`Benchmark stack did not become ready within ${timeoutMs} ms`)
}

await waitForServer()
const apiResponse = await request('/api/products')
if (!apiResponse.ok) throw new Error(`Catalog API returned HTTP ${apiResponse.status}`)
const feed = await apiResponse.json()
if (!Array.isArray(feed.products) || feed.products.length !== 12) {
  throw new Error(`Catalog API must return 12 products; received ${feed.products?.length ?? 0}`)
}

for (const framework of ['react', 'vue', 'angular']) {
  for (const mode of ['csr', 'ssr', 'ssg']) {
    const response = await request(`/${framework}/${mode}`, true)
    if (!response.ok) throw new Error(`${framework}/${mode} returned HTTP ${response.status}`)
    const html = await response.text()
    const cardCount = (html.match(/class="card"/g) ?? []).length
    if (mode === 'csr' && cardCount !== 0) {
      throw new Error(`${framework}/csr should render cards in the browser, not the initial HTML`)
    }
    if (mode !== 'csr' && cardCount !== 12) {
      throw new Error(`${framework}/${mode} should prerender 12 cards; found ${cardCount}`)
    }
    console.log(`OK ${framework}/${mode}: HTTP ${response.status}, initial HTML cards=${cardCount}`)
  }
}

console.log(`OK fixed catalog: ${feed.products.length} products; same-origin host: ${baseUrl}`)
