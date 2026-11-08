
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
    networkProfiles,
    workloadProfiles,
    workloadMetadata,
} from './benchmark-workloads.mjs'

const allFrameworks = ['react', 'vue', 'angular']
const allModes = ['csr', 'ssr', 'ssg']
const allNetworkProfiles = Object.keys(networkProfiles)
const allWorkloads = Object.keys(workloadProfiles)
const resourceTypes = {
    Script: 'scriptRequestCount',
    Stylesheet: 'stylesheetRequestCount',
    Image: 'imageRequestCount',
    Font: 'fontRequestCount',
    Document: 'documentRequestCount',
    XHR: 'xhrRequestCount',
    Fetch: 'fetchRequestCount',
    Media: 'mediaRequestCount',
    Other: 'otherRequestCount',
}

const frameworks = (
    process.env.BENCHMARK_FRAMEWORKS?.split(',') ?? allFrameworks
).map((value) => value.trim())

const modes = (
    process.env.BENCHMARK_MODES?.split(',') ?? allModes
).map((value) => value.trim())

const selectedNetworkProfiles = (
    process.env.BENCHMARK_NETWORK_PROFILES?.split(',') ?? allNetworkProfiles
).map((value) => value.trim())

const workloads = (
    process.env.BENCHMARK_WORKLOADS?.split(',') ?? allWorkloads
).map((value) => value.trim())

const runs = Number(process.env.BENCHMARK_RUNS || 20)

const baseUrl = (
    process.env.BENCHMARK_BASE_URL || 'http://localhost:8080'
).replace(/\/+$/, '')

const outputDir = resolve(
    process.env.BENCHMARK_OUTPUT_DIR || 'artifacts/lighthouse'
)

const reuseReports = process.env.BENCHMARK_REUSE_REPORTS === 'true'
const resumeReports = process.env.BENCHMARK_RESUME === 'true'

if (!Number.isInteger(runs) || runs < 1 || runs > 100) {
    throw new Error('BENCHMARK_RUNS must be an integer from 1 to 100')
}

function countResourceType(records, resourceType) {
    if (resourceType === 'Other') {
        return records.filter(
            (record) => !Object.hasOwn(resourceTypes, record.resourceType)
                || record.resourceType === 'Other'
        ).length
    }

    return records.filter(
        (record) => record.resourceType === resourceType
    ).length
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

if (
    selectedNetworkProfiles.length === 0 ||
    selectedNetworkProfiles.some(
        (profile) => !allNetworkProfiles.includes(profile)
    )
) {
    throw new Error(
        `BENCHMARK_NETWORK_PROFILES must contain values from: ${allNetworkProfiles.join(', ')}`
    )
}

if (
    workloads.length === 0 ||
    workloads.some((workload) => !allWorkloads.includes(workload))
) {
    throw new Error(
        `BENCHMARK_WORKLOADS must contain values from: ${allWorkloads.join(', ')}`
    )
}

console.log(
    `Planned Lighthouse runs: ${
        frameworks.length *
        modes.length *
        selectedNetworkProfiles.length *
        workloads.length *
        runs
    }`
)

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

function createSample(
    report,
    framework,
    mode,
    networkProfile,
    workload,
    run,
    url
) {
    const requests =
        report.audits?.['network-requests']
            ?.details?.items ?? []

    const api = getApiLatency(requests)
    const network = networkProfiles[networkProfile]

    return {
        framework,
        mode,
        networkProfile,
        networkRttMs: network.rttMs,
        networkThroughputKbps: network.throughputKbps,
        workload,
        ...workloadMetadata(workload),
        run,
        url,

        lcpMs: auditValue(report, 'largest-contentful-paint'),
        ttfbMs: auditValue(report, 'server-response-time'),
        fcpMs: auditValue(report, 'first-contentful-paint'),
        tbtMs: auditValue(report, 'total-blocking-time'),
        domNodes: auditValue(report, 'dom-size'),

        requestCount: requests.length,

        jsTransferBytes: sumTransfer(
            requests,
            (request) => request.resourceType === 'Script'
        ),

        cssTransferBytes: sumTransfer(
            requests,
            (request) => request.resourceType === 'Stylesheet'
        ),

        imageTransferBytes: sumTransfer(
            requests,
            (request) => request.resourceType === 'Image'
        ),

        htmlTransferBytes: sumTransfer(
            requests,
            (request) => request.resourceType === 'Document'
        ),

        ...Object.fromEntries(
            Object.entries(resourceTypes).map(([resourceType, field]) => [
                field,
                countResourceType(requests, resourceType),
            ])
        ),

        apiRequestCount: api.apiRequestCount,
        apiLatencyMs: api.apiLatencyMs,

        performanceScore:
            report.categories?.performance?.score ?? null,

        lcpElement: getLcpElement(report),
    }
}

function assertAppliedNetworkSettings(report, network, url) {
    const appliedSettings = report.configSettings
    if (appliedSettings?.throttlingMethod !== 'devtools') {
        throw new Error(
            `Lighthouse did not apply DevTools throttling for ${url}`
        )
    }

    for (const [setting, expectedValue] of Object.entries(network)) {
        if (appliedSettings.throttling?.[setting] !== expectedValue) {
            throw new Error(
                `Lighthouse did not apply ${setting}=${expectedValue} for ${url}`
            )
        }
    }
}

async function runLighthouse(url, network, lighthouse, launch) {
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
            formFactor: 'mobile',
            throttlingMethod: 'devtools',
            throttling: network,
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

async function writeJsonAtomically(path, value) {
    const temporaryPath = `${path}.${process.pid}.tmp`
    const contents = JSON.stringify(value, null, 2)

    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            await writeFile(temporaryPath, contents)
            await rename(temporaryPath, path)
            return
        } catch (error) {
            if (
                attempt === 4 ||
                !['EIO', 'EBUSY', 'EPERM', 'ENOSPC'].includes(error.code)
            ) {
                throw error
            }
            console.warn(
                `Write failed for ${path} (${error.code}); retrying ${attempt}/3`
            )
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
        }
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
        for (const networkProfile of selectedNetworkProfiles) {
            for (const workload of workloads) {
                const url = new URL(`${baseUrl}/${framework}/${mode}`)
                url.searchParams.set('networkProfile', networkProfile)
                url.searchParams.set('workload', workload)

                for (let run = 1; run <= runs; run++) {
                    const filename =
                        `${framework}-${mode}-${networkProfile}-${workload}-${run}.json`
                    const reportPath = resolve(outputDir, filename)

                    let report

                    if (reuseReports) {
                        console.log(
                            `Reading ${framework}/${mode}/${networkProfile}/${workload}: run ${run}/${runs}`
                        )

                        report = JSON.parse(
                            await readFile(reportPath, 'utf8')
                        )
                    } else if (resumeReports) {
                        try {
                            const existingReport = JSON.parse(
                                await readFile(reportPath, 'utf8')
                            )
                            assertAppliedNetworkSettings(
                                existingReport,
                                networkProfiles[networkProfile],
                                url.toString()
                            )
                            if (
                                !Number.isFinite(
                                    existingReport.audits?.[
                                        'largest-contentful-paint'
                                    ]?.numericValue
                                )
                            ) {
                                throw new Error(
                                    'Report has no numeric LCP audit'
                                )
                            }
                            report = existingReport
                            console.log(
                                `Resuming: keeping valid ${framework}/${mode}/${networkProfile}/${workload} run ${run}/${runs}`
                            )
                        } catch (error) {
                            if (
                                error.code !== 'ENOENT' &&
                                !(error instanceof SyntaxError) &&
                                !error.message.startsWith(
                                    'Lighthouse did not apply '
                                ) &&
                                error.message !== 'Report has no numeric LCP audit'
                            ) {
                                throw error
                            }
                            if (error.code !== 'ENOENT') {
                                console.warn(
                                    `Re-running invalid report ${filename}: ${error.message}`
                                )
                            }
                        }
                    }

                    if (!report) {
                        if (!reuseReports) {
                            console.log(
                                `Lighthouse ${framework}/${mode}/${networkProfile}/${workload}: run ${run}/${runs}`
                            )

                            report = await runLighthouse(
                                url.toString(),
                                networkProfiles[networkProfile],
                                lighthouse,
                                launch
                            )
                        } else {
                            throw new Error(
                                `No reusable report found at ${reportPath}`
                            )
                        }
                    } else {
                        console.log(`Using saved report: ${filename}`)
                    }

                    assertAppliedNetworkSettings(
                        report,
                        networkProfiles[networkProfile],
                        url.toString()
                    )

                    if (!reuseReports) {
                        await writeJsonAtomically(reportPath, report)
                    }

                    const sample = createSample(
                        report,
                        framework,
                        mode,
                        networkProfile,
                        workload,
                        run,
                        url.toString()
                    )

                    samples.push(sample)

                    console.log({
                        lcpMs: sample.lcpMs,
                        fcpMs: sample.fcpMs,
                        tbtMs: sample.tbtMs,
                        jsTransferBytes: sample.jsTransferBytes,
                        cssTransferBytes: sample.cssTransferBytes,
                        imageTransferBytes: sample.imageTransferBytes,
                        domNodes: sample.domNodes,
                    })
                }
            }
        }
    }
}

const summary = frameworks.flatMap((framework) =>
    modes.flatMap((mode) =>
        selectedNetworkProfiles.flatMap((networkProfile) =>
            workloads.map((workload) => {
                const group = samples.filter(
                    (sample) =>
                        sample.framework === framework &&
                        sample.mode === mode &&
                        sample.networkProfile === networkProfile &&
                        sample.workload === workload
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
                    networkProfile,
                    networkRttMs: networkProfiles[networkProfile].rttMs,
                    networkThroughputKbps:
                        networkProfiles[networkProfile].throughputKbps,
                    workload,
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

                    scriptRequestsMedian: median(
                        group.map((sample) => sample.scriptRequestCount)
                    ),

                    stylesheetRequestsMedian: median(
                        group.map((sample) => sample.stylesheetRequestCount)
                    ),

                    imageRequestsMedian: median(
                        group.map((sample) => sample.imageRequestCount)
                    ),

                    fontRequestsMedian: median(
                        group.map((sample) => sample.fontRequestCount)
                    ),

                    documentRequestsMedian: median(
                        group.map((sample) => sample.documentRequestCount)
                    ),

                    xhrRequestsMedian: median(
                        group.map((sample) => sample.xhrRequestCount)
                    ),

                    fetchRequestsMedian: median(
                        group.map((sample) => sample.fetchRequestCount)
                    ),

                    mediaRequestsMedian: median(
                        group.map((sample) => sample.mediaRequestCount)
                    ),

                    otherRequestsMedian: median(
                        group.map((sample) => sample.otherRequestCount)
                    ),

                    jsTransferMedianBytes: median(
                        group.map((sample) => sample.jsTransferBytes)
                    ),

                    cssTransferMedianBytes: median(
                        group.map((sample) => sample.cssTransferBytes)
                    ),

                    imageTransferMedianBytes: median(
                        group.map((sample) => sample.imageTransferBytes)
                    ),

                    htmlTransferMedianBytes: median(
                        group.map((sample) => sample.htmlTransferBytes)
                    ),

                    domNodesMedian: median(
                        group.map((sample) => sample.domNodes)
                    ),

                    apiRequestCountMedian: median(
                        group.map((sample) => sample.apiRequestCount)
                    ),

                    apiLatencyMedianMs: median(
                        group.map((sample) => sample.apiLatencyMs)
                    ),

                    syntheticJsBytes: group[0]?.syntheticJsBytes ?? null,
                    catalogItems: group[0]?.catalogItems ?? null,
                    syntheticImageCount: group[0]?.syntheticImageCount ?? null,
                    syntheticImageBytes: group[0]?.syntheticImageBytes ?? null,
                    syntheticImagesTotalBytes: group[0]?.syntheticImagesTotalBytes ?? null,
                    syntheticDomNodes: group[0]?.syntheticDomNodes ?? null,
                    extraDomCards: group[0]?.extraDomCards ?? null,
                    imageWidth: group[0]?.imageWidth ?? null,
                    lcpElement: mostCommonLcpElement,
                }
            })
        )
    )
)

const columns = [
    'framework',
    'mode',
    'networkProfile',
    'networkRttMs',
    'networkThroughputKbps',
    'workload',
    'runs',
    'lcpMedianMs',
    'ttfbMedianMs',
    'fcpMedianMs',
    'tbtMedianMs',
    'requestsMedian',
    'scriptRequestsMedian',
    'stylesheetRequestsMedian',
    'imageRequestsMedian',
    'fontRequestsMedian',
    'documentRequestsMedian',
    'xhrRequestsMedian',
    'fetchRequestsMedian',
    'mediaRequestsMedian',
    'otherRequestsMedian',
    'jsTransferMedianBytes',
    'cssTransferMedianBytes',
    'imageTransferMedianBytes',
    'htmlTransferMedianBytes',
    'domNodesMedian',
    'catalogItems',
    'syntheticJsBytes',
    'syntheticImageCount',
    'syntheticImageBytes',
    'syntheticImagesTotalBytes',
    'syntheticDomNodes',
    'extraDomCards',
    'imageWidth',
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

await writeJsonAtomically(
    resolve(outputDir, 'samples.json'),
    samples
)

await writeJsonAtomically(
    resolve(outputDir, 'summary.json'),
    summary
)

const summaryCsvPath = resolve(outputDir, 'summary.csv')
const summaryCsvTempPath = `${summaryCsvPath}.${process.pid}.tmp`
await writeFile(summaryCsvTempPath, `${csv}\n`)
await rename(summaryCsvTempPath, summaryCsvPath)

console.table(summary)

console.log(
    `Saved ${samples.length} Lighthouse runs to ${outputDir}`
)

if (reuseReports) {
    console.log('Statistics recalculated from existing JSON reports.')
}
if (resumeReports) {
    console.log('Valid reports were reused; only missing or invalid runs were measured.')
}
