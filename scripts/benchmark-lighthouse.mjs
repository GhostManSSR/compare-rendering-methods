
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const allFrameworks = ['react', 'vue', 'angular']
const allModes = ['csr', 'ssr', 'ssg']

const frameworks = (
    process.env.BENCHMARK_FRAMEWORKS?.split(',') ?? allFrameworks
).map((value) => value.trim())

const modes = (
    process.env.BENCHMARK_MODES?.split(',') ?? allModes
).map((value) => value.trim())

const runs = Number(process.env.BENCHMARK_RUNS || 5)

const baseUrl = (
    process.env.BENCHMARK_BASE_URL || 'http://localhost:8080'
).replace(/\/+$/, '')

const outputDir = resolve(
    process.env.BENCHMARK_OUTPUT_DIR || 'artifacts/lighthouse'
)

const reuseReports = process.env.BENCHMARK_REUSE_REPORTS === 'true'

if (!Number.isInteger(runs) || runs < 5 || runs > 10) {
    throw new Error('BENCHMARK_RUNS must be an integer from 5 to 10')
}

if (
    frameworks.length === 0 ||
    frameworks.some((framework) => !allFrameworks.includes(framework))
) {
    throw new Error(
        `BENCHMARK_FRAMEWORKS must contain values from: ${allFrameworks.join(', ')}`
    )
}

if (
    modes.length === 0 ||
    modes.some((mode) => !allModes.includes(mode))
) {
    throw new Error(
        `BENCHMARK_MODES must contain values from: ${allModes.join(', ')}`
    )
}

await mkdir(outputDir, { recursive: true })

const chromePath = process.env.CHROME_PATH ?? (
    process.platform === 'win32'
        ? resolve(
            process.env.ProgramFiles || 'C:\\Program Files',
            'Google',
            'Chrome',
            'Application',
            'chrome.exe'
        )
        : undefined
)

function auditValue(report, id) {
    const value = report.audits?.[id]?.numericValue
    return Number.isFinite(value) ? value : null
}

function sumTransfer(records, predicate) {
    return records
        .filter(predicate)
        .reduce(
            (total, record) =>
                total + (
                    Number.isFinite(record.transferSize)
                        ? record.transferSize
                        : 0
                ),
            0
        )
}

function median(values) {
    const sorted = values
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b)

    if (sorted.length === 0) {
        return null
    }

    const middle = Math.floor(sorted.length / 2)

    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2
}

function csvCell(value) {
    const text = value == null ? '' : String(value)
    return `"${text.replaceAll('"', '""')}"`
}

function getLcpElement(report) {
    const audits = report.audits ?? {}

    const insightItems =
        audits['lcp-discovery-insight']?.details?.items ?? []

    const insightNode = insightItems.find(
        (item) => item?.type === 'node'
    )

    if (insightNode) {
        return insightNode.selector
            ?? insightNode.nodeLabel
            ?? insightNode.snippet
            ?? null
    }

    const oldItems =
        audits['largest-contentful-paint-element']
            ?.details?.items ?? []

    for (const item of oldItems) {
        const node = item?.node

        if (node) {
            return node.selector
                ?? node.nodeLabel
                ?? node.snippet
                ?? null
        }
    }

    return null
}

function getApiLatency(requests) {
    const apiRequests = requests.filter(
        (request) => request.url?.includes('/api/products')
    )

    const durations = apiRequests.map((request) => {
        const start = request.networkRequestTime
        const end = request.networkEndTime

        if (
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            end < start
        ) {
            return null
        }

        return (end - start) * 1000
    })

    return {
        apiRequestCount: apiRequests.length,
        apiLatencyMs: median(durations),
    }
}

function createSample(report, framework, mode, run, url) {
    const requests =
        report.audits?.['network-requests']
            ?.details?.items ?? []

    const api = getApiLatency(requests)

    return {
        framework,
        mode,
        run,
        url,

        lcpMs: auditValue(report, 'largest-contentful-paint'),
        ttfbMs: auditValue(report, 'server-response-time'),
        fcpMs: auditValue(report, 'first-contentful-paint'),
        tbtMs: auditValue(report, 'total-blocking-time'),

        requestCount: requests.length,

        jsTransferBytes: sumTransfer(
            requests,
            (request) => request.resourceType === 'Script'
        ),

        htmlTransferBytes: sumTransfer(
            requests,
            (request) => request.resourceType === 'Document'
        ),

        apiRequestCount: api.apiRequestCount,
        apiLatencyMs: api.apiLatencyMs,

        performanceScore:
            report.categories?.performance?.score ?? null,

        lcpElement: getLcpElement(report),
    }
}

async function runLighthouse(url, lighthouse, launch) {
    const chrome = await launch({
        ...(chromePath ? { chromePath } : {}),
        chromeFlags: [
            '--headless',
            '--no-sandbox',
            '--disable-dev-shm-usage',
        ],
    })

    try {
        const result = await lighthouse(url, {
            port: chrome.port,
            logLevel: 'error',
            output: 'json',
            onlyCategories: ['performance'],
            disableStorageReset: false,
        })

        if (!result?.lhr) {
            throw new Error(`Lighthouse returned no report for ${url}`)
        }

        if (result.lhr.runtimeError) {
            throw new Error(
                `Lighthouse failed for ${url}: ${
                    result.lhr.runtimeError.message
                }`
            )
        }

        return result.lhr
    } finally {
        await chrome.kill()
    }
}

let lighthouse
let launch

if (!reuseReports) {
    const lighthouseModule = await import('lighthouse')
    const chromeModule = await import('chrome-launcher')

    lighthouse = lighthouseModule.default
    launch = chromeModule.launch
}

const samples = []

for (const framework of frameworks) {
    for (const mode of modes) {
        const url = `${baseUrl}/${framework}/${mode}`

        for (let run = 1; run <= runs; run++) {
            const filename = `${framework}-${mode}-${run}.json`
            const reportPath = resolve(outputDir, filename)

            let report

            if (reuseReports) {
                console.log(
                    `Reading ${framework}/${mode}: run ${run}/${runs}`
                )

                report = JSON.parse(
                    await readFile(reportPath, 'utf8')
                )
            } else {
                console.log(
                    `Lighthouse ${framework}/${mode}: run ${run}/${runs}`
                )

                report = await runLighthouse(
                    url,
                    lighthouse,
                    launch
                )

                await writeFile(
                    reportPath,
                    JSON.stringify(report, null, 2)
                )
            }

            const sample = createSample(
                report,
                framework,
                mode,
                run,
                url
            )

            samples.push(sample)

            console.log({
                lcpMs: sample.lcpMs,
                fcpMs: sample.fcpMs,
                tbtMs: sample.tbtMs,
                apiRequestCount: sample.apiRequestCount,
                apiLatencyMs: sample.apiLatencyMs,
                lcpElement: sample.lcpElement,
            })
        }
    }
}

const summary = frameworks.flatMap((framework) =>
    modes.map((mode) => {
        const group = samples.filter(
            (sample) =>
                sample.framework === framework &&
                sample.mode === mode
        )

        const lcpElements = group
            .map((sample) => sample.lcpElement)
            .filter(Boolean)

        const lcpCounts = new Map()

        for (const element of lcpElements) {
            lcpCounts.set(
                element,
                (lcpCounts.get(element) ?? 0) + 1
            )
        }

        const mostCommonLcpElement = [...lcpCounts.entries()]
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

        return {
            framework,
            mode,
            runs: group.length,

            lcpMedianMs: median(
                group.map((sample) => sample.lcpMs)
            ),

            ttfbMedianMs: median(
                group.map((sample) => sample.ttfbMs)
            ),

            fcpMedianMs: median(
                group.map((sample) => sample.fcpMs)
            ),

            tbtMedianMs: median(
                group.map((sample) => sample.tbtMs)
            ),

            requestsMedian: median(
                group.map((sample) => sample.requestCount)
            ),

            jsTransferMedianBytes: median(
                group.map((sample) => sample.jsTransferBytes)
            ),

            htmlTransferMedianBytes: median(
                group.map((sample) => sample.htmlTransferBytes)
            ),

            apiRequestCountMedian: median(
                group.map((sample) => sample.apiRequestCount)
            ),

            apiLatencyMedianMs: median(
                group.map((sample) => sample.apiLatencyMs)
            ),

            lcpElement: mostCommonLcpElement,
        }
    })
)

const columns = [
    'framework',
    'mode',
    'runs',
    'lcpMedianMs',
    'ttfbMedianMs',
    'fcpMedianMs',
    'tbtMedianMs',
    'requestsMedian',
    'jsTransferMedianBytes',
    'htmlTransferMedianBytes',
    'apiRequestCountMedian',
    'apiLatencyMedianMs',
    'lcpElement',
]

const csv = [
    columns.join(','),
    ...summary.map((row) =>
        columns
            .map((column) => csvCell(row[column]))
            .join(',')
    ),
].join('\n')

await writeFile(
    resolve(outputDir, 'samples.json'),
    JSON.stringify(samples, null, 2)
)

await writeFile(
    resolve(outputDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
)

await writeFile(
    resolve(outputDir, 'summary.csv'),
    `${csv}\n`
)

console.table(summary)

console.log(
    `Saved ${samples.length} Lighthouse runs to ${outputDir}`
)

if (reuseReports) {
    console.log('Statistics recalculated from existing JSON reports.')
}
