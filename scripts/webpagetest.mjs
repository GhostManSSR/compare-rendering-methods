import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const apiKey = process.env.WPT_API_KEY
const location = process.env.WPT_LOCATION
if (!apiKey) throw new Error('Set WPT_API_KEY before submitting WebPageTest runs')
if (!location) throw new Error('Set WPT_LOCATION to a Chrome-capable WebPageTest location')

const baseUrl = (process.env.BENCHMARK_BASE_URL || '').replace(/\/+$/, '')
if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
  throw new Error('Set BENCHMARK_BASE_URL to a publicly reachable HTTP(S) URL')
}

const runs = Number(process.env.WPT_RUNS || 9)
if (!Number.isInteger(runs) || runs < 5 || runs > 10) {
  throw new Error('WPT_RUNS must be an integer from 5 to 10')
}

const outputDir = resolve('artifacts/webpagetest')
await mkdir(outputDir, { recursive: true })

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  const body = await response.json()
  if (!response.ok) throw new Error(`WebPageTest HTTP ${response.status}: ${JSON.stringify(body)}`)
  if (body.statusCode && body.statusCode !== 200) {
    throw new Error(`WebPageTest status ${body.statusCode}: ${body.statusText}`)
  }
  return body
}

async function waitForResult(testId) {
  const deadline = Date.now() + 20 * 60 * 1000
  while (Date.now() < deadline) {
    const status = await getJson(
      `https://www.webpagetest.org/testStatus.php?f=json&test=${encodeURIComponent(testId)}`,
    )
    if (status.statusCode === 200) return
    if (![100, 101, 102].includes(status.statusCode)) {
      throw new Error(`Unexpected WebPageTest status ${status.statusCode}: ${status.statusText}`)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10000))
  }
  throw new Error(`Timed out waiting for WebPageTest ${testId}`)
}

function readMetric(firstView, names) {
  for (const name of names) {
    const value = firstView[name]
    if (Number.isFinite(value)) return value
  }
  return null
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const rows = []
for (const framework of ['react', 'vue', 'angular']) {
  for (const mode of ['csr', 'ssr', 'ssg']) {
    const url = `${baseUrl}/${framework}/${mode}`
    const submit = new URL('https://www.webpagetest.org/runtest.php')
    submit.searchParams.set('url', url)
    submit.searchParams.set('k', apiKey)
    submit.searchParams.set('f', 'json')
    submit.searchParams.set('location', location)
    submit.searchParams.set('runs', String(runs))
    submit.searchParams.set('mobile', '1')
    submit.searchParams.set('connectivity', process.env.WPT_CONNECTIVITY || '4G')
    submit.searchParams.set('fvonly', '1')
    submit.searchParams.set('lighthouse', '1')
    console.log(`Submitting ${framework}/${mode} to WebPageTest (${runs} runs, ${location})`)
    const submitted = await getJson(submit)
    const testId = submitted.data?.testId
    if (!testId) throw new Error(`WebPageTest did not return a test ID: ${JSON.stringify(submitted)}`)
    await waitForResult(testId)

    const resultUrl = `https://www.webpagetest.org/jsonResult.php?test=${encodeURIComponent(testId)}`
    const result = await getJson(resultUrl)
    const runRows = Object.values(result.data?.runs ?? {}).map((run, index) => {
      const firstView = run.firstView ?? {}
      return {
        framework,
        mode,
        testId,
        run: index + 1,
        lcpMs: readMetric(firstView, ['largestContentfulPaint', 'LCP']),
        ttfbMs: readMetric(firstView, ['TTFB']),
        fcpMs: readMetric(firstView, ['firstContentfulPaint', 'FCP']),
        tbtMs: readMetric(firstView, ['totalBlockingTime', 'TBT']),
        requests: readMetric(firstView, ['requests']),
        jsBytes: readMetric(firstView, ['bytesJS']),
        htmlBytes: readMetric(firstView, ['bytesDoc']),
      }
    })
    if (!runRows.length) throw new Error(`WebPageTest returned no runs for ${testId}`)
    rows.push({
      framework,
      mode,
      testId,
      reportUrl: result.data?.summary ?? `https://www.webpagetest.org/result/${testId}/`,
      runs: runRows,
      median: {
        lcpMs: median(runRows.map((run) => run.lcpMs)),
        ttfbMs: median(runRows.map((run) => run.ttfbMs)),
        fcpMs: median(runRows.map((run) => run.fcpMs)),
        tbtMs: median(runRows.map((run) => run.tbtMs)),
        requests: median(runRows.map((run) => run.requests)),
        jsBytes: median(runRows.map((run) => run.jsBytes)),
        htmlBytes: median(runRows.map((run) => run.htmlBytes)),
      },
    })
    await writeFile(
      resolve(outputDir, `${framework}-${mode}.json`),
      JSON.stringify(result, null, 2),
    )
  }
}

await writeFile(resolve(outputDir, 'summary.json'), JSON.stringify(rows, null, 2))
console.table(rows.map(({ framework, mode, testId, reportUrl, median: metrics }) => ({
  framework, mode, testId, reportUrl, ...metrics,
})))
console.log(`Saved WebPageTest reports to ${outputDir}`)
