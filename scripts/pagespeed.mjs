import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.PSI_BASE_URL
if (!baseUrl) throw new Error('Set PSI_BASE_URL to a publicly accessible deployment URL')

const root = baseUrl.replace(/\/+$/, '')
const outputDir = resolve('artifacts/pagespeed')
const routes = ['react', 'vue', 'angular'].flatMap((framework) =>
  ['csr', 'ssr', 'ssg'].map((mode) => `${root}/${framework}/${mode}`),
)
await mkdir(outputDir, { recursive: true })

function auditValue(report, id) {
  return report.audits[id]?.numericValue ?? null
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const results = []
for (const url of routes) {
  for (const strategy of ['mobile', 'desktop']) {
    const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
    endpoint.searchParams.set('url', url)
    endpoint.searchParams.set('strategy', strategy)
    endpoint.searchParams.set('category', 'performance')
    if (process.env.PSI_API_KEY) endpoint.searchParams.set('key', process.env.PSI_API_KEY)

    const response = await fetch(endpoint, { signal: AbortSignal.timeout(120000) })
    const body = await response.json()
    if (!response.ok || body.error) {
      throw new Error(`PageSpeed Insights failed for ${strategy} ${url}: ${JSON.stringify(body.error ?? body)}`)
    }

    const report = body.lighthouseResult
    const records = report.audits['network-requests']?.details?.items ?? []
    const total = (matches) => records
      .filter(matches)
      .reduce((sum, request) => sum + (request.transferSize ?? 0), 0)
    const metrics = {
      url,
      strategy,
      performanceScore: report.categories.performance?.score ?? null,
      lcpMs: auditValue(report, 'largest-contentful-paint'),
      ttfbMs: auditValue(report, 'server-response-time'),
      fcpMs: auditValue(report, 'first-contentful-paint'),
      tbtMs: auditValue(report, 'total-blocking-time'),
      requestCount: records.length,
      jsTransferBytes: total((request) => request.resourceType === 'Script'),
      htmlTransferBytes: total((request) => request.resourceType === 'Document'),
      apiLatencyMs: median(records
        .filter((request) => request.url?.includes('/api/products'))
        .map((request) => Number.isFinite(request.networkEndTime) && Number.isFinite(request.networkRequestTime)
          ? (request.networkEndTime - request.networkRequestTime) * 1000
          : null)),
    }
    results.push(metrics)
    const safeName = url.slice(root.length + 1).replaceAll('/', '-')
    await writeFile(
      resolve(outputDir, `${safeName}-${strategy}.json`),
      JSON.stringify(body, null, 2),
    )
    console.log(`${strategy} ${url}: LCP ${metrics.lcpMs ?? 'n/a'} ms`)
  }
}

await writeFile(resolve(outputDir, 'summary.json'), JSON.stringify(results, null, 2))
console.log(`Saved ${results.length} PageSpeed reports to ${outputDir}`)
