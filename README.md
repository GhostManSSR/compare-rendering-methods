# CSR vs. SSR vs. SSG: React, Vue, and Angular

A performance benchmarking environment for nine rendering configurations of a product catalog containing 12 products. All applications use the same data from `data/products.json`, identical images, and the same layout. Production builds are served through a single Nginx instance under a shared origin.

## Requirements

- Docker Desktop with Docker Compose
- Node.js 22 and npm — for running commands locally

## Getting Started

```powershell
docker compose up --build -d
```

Health check: [http://localhost:8080/health](http://localhost:8080/health)

| Framework | CSR | SSR | SSG |
|---|---|---|---|
| React | [CSR](http://localhost:8080/react/csr) | [SSR](http://localhost:8080/react/ssr) | [SSG](http://localhost:8080/react/ssg) |
| Vue | [CSR](http://localhost:8080/vue/csr) | [SSR](http://localhost:8080/vue/ssr) | [SSG](http://localhost:8080/vue/ssg) |
| Angular | [CSR](http://localhost:8080/angular/csr) | [SSR](http://localhost:8080/angular/ssr) | [SSG](http://localhost:8080/angular/ssg) |

To stop the environment:

```powershell
docker compose down
```

## Lighthouse Performance Benchmarks

The recommended approach is to run Chromium inside Docker. This eliminates the need for a locally installed Chrome browser and benchmarks all nine configurations five times each, resulting in **45 Lighthouse runs**.

```powershell
docker compose --profile tools build lighthouse-runner
docker compose --profile tools run --rm lighthouse-runner
```

By default, benchmark results are saved to `artifacts/lighthouse/`:

- `react-csr-1.json` and similar files — complete reports for individual runs.
- `samples.json` — metrics collected from each run.
- `summary.json` and `summary.csv` — aggregated median metrics grouped by framework and rendering mode.

The summary includes the following metrics:

- **LCP (Largest Contentful Paint)**
- **TTFB (Time to First Byte)**
- **FCP (First Contentful Paint)**
- **TBT (Total Blocking Time)**
- Total number of network requests
- Transferred JavaScript and HTML sizes
- Number of browser-side API requests
- API request latency
- LCP element (when identified by Lighthouse)

An empty API latency value indicates that no measurement was available, **not that the latency was zero**.

With SSR and SSG, catalog data may be fetched on the server or during the build process. Consequently, these requests may not appear in the browser's network activity.

### Customizing Benchmark Runs

The number of runs can be configured between 5 and 10. Benchmarks can also be restricted to specific frameworks and rendering modes.

For example, to benchmark only React SSG with five runs:

```powershell
$env:BENCHMARK_RUNS = '5'
$env:BENCHMARK_FRAMEWORKS = 'react'
$env:BENCHMARK_MODES = 'ssg'

docker compose --profile tools run --rm lighthouse-runner
```

After benchmarking, you can clear the environment variables from the current PowerShell session:

```powershell
Remove-Item Env:BENCHMARK_RUNS, Env:BENCHMARK_FRAMEWORKS, Env:BENCHMARK_MODES -ErrorAction SilentlyContinue
```

### Recalculating Results Without Rerunning Benchmarks

If the original Lighthouse JSON reports are already available in `artifacts/lighthouse/`, you can regenerate the summary after modifying the metric extraction logic.

```powershell
npm ci

$env:BENCHMARK_REUSE_REPORTS = 'true'

npm run benchmark:lighthouse

Remove-Item Env:BENCHMARK_REUSE_REPORTS
```

This process reuses existing Lighthouse reports without launching Chromium.

The corresponding JSON files must exist for every selected framework, rendering mode, and run number.

## Benchmark Methodology

| Rendering Mode | How Content Is Generated |
|---|---|
| **CSR (Client-Side Rendering)** | The browser downloads JavaScript, fetches catalog data through an API, and constructs the DOM. |
| **SSR (Server-Side Rendering)** | The server retrieves the data and returns HTML containing product cards. The page is subsequently hydrated in the browser. |
| **SSG (Static Site Generation)** | HTML containing product cards is generated at build time and served as a pre-rendered page. |

To ensure a fair comparison, all configurations should use:

- Production builds
- Identical product data
- Identical images and layouts
- Consistent network conditions
- The same Lighthouse configuration

**Compare median values across multiple runs rather than relying on individual measurements.**

Local TTFB measurements reflect the Docker environment and should not be interpreted as representative of latency in a publicly hosted production environment.

### External Performance Testing Services

External services such as PageSpeed Insights and WebPageTest cannot benchmark applications running on `localhost` or internal addresses such as `http://benchmark`.

These services require a publicly accessible website.

## Product Catalog Data

The source product dataset is stored in `data/products.json`.

To update the catalog, run the following commands:

```powershell
npm ci
npm run catalog:update
docker compose up --build -d
```

Updating the catalog changes the experimental conditions.

**For meaningful and reproducible comparisons, only compare benchmark results collected using the same product dataset.**
