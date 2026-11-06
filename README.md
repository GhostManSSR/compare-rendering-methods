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

Рекомендуемый способ — Chromium внутри Docker. Он не зависит от локальной установки Chrome и проверяет все сочетания фреймворка, режима рендеринга, сетевого профиля и нагрузки: **9 × 3 × 3 конфигурации с 20 повторами = 1 620 запусков Lighthouse**. Полный эксперимент может выполняться долго.

```powershell
docker compose --profile tools build lighthouse-runner
docker compose --profile tools run --rm lighthouse-runner
```

По умолчанию результаты сохраняются в `artifacts/lighthouse/`:

- `react-csr-fast-4g-light-1.json` и аналогичные файлы — полные отчёты отдельных запусков;
- `samples.json` — метрики каждого запуска;
- `summary.json` и `summary.csv` — сводные медианы по всем факторам эксперимента.

Сетевые профили задаются через Lighthouse DevTools throttling: `fast-4g` (20 мс, 10 240 Кбит/с), `regular-4g` (40 мс, 4 096 Кбит/с) и `slow-3g` (150 мс, 1 600 Кбит/с). Уровни нагрузки формируют воспроизводимые дополнительные ресурсы: `light` — без добавочной нагрузки; `medium` — 24 КБ JavaScript, 24 DOM-карточки и 6 изображений по 16 КБ; `heavy` — 96 КБ JavaScript, 60 DOM-карточек и 24 изображения по 64 КБ. Генерируемые JS и SVG обслуживаются локально, поэтому их объём не зависит от сторонних CDN.

В измерения включены LCP, TTFB, FCP, TBT, фактическое число DOM-узлов, сетевые запросы и объём передачи JS/изображений/HTML. TBT складывает части задач главного потока сверх порога 50 мс между FCP и TTI. Поэтому Lighthouse может корректно показать `0` для React/Vue, если за этот интервал не было длинных задач; больший стартовый JS-бандл Angular может создавать такие задачи при CSR, SSR и SSG. Пустая задержка API означает отсутствие доступного измерения, **не нулевую задержку**. При SSR/SSG запрос каталога может выполняться на сервере или при сборке и не попадать в сетевые запросы браузера.

Скрипт проверяет `configSettings` каждого Lighthouse-отчёта и прекращает запуск, если выбранный сетевой профиль не применился. Старые отчёты, собранные до этой проверки, могли использовать настройки сети Lighthouse по умолчанию и не должны считаться измерениями объявленных сетевых профилей.

Для быстрой проверки можно уменьшить число повторов и ограничить матрицу. Полный протокол использует ровно 20 повторений на каждую конфигурацию:

```powershell
$env:BENCHMARK_RUNS = '1'
$env:BENCHMARK_FRAMEWORKS = 'react'
$env:BENCHMARK_MODES = 'ssg'
$env:BENCHMARK_NETWORK_PROFILES = 'fast-4g'
$env:BENCHMARK_WORKLOADS = 'light'
docker compose --profile tools run --rm lighthouse-runner
```

После бенчмарка можно очистить переменные окружения в текущей сессии PowerShell:

```powershell
Remove-Item Env:BENCHMARK_RUNS, Env:BENCHMARK_FRAMEWORKS, Env:BENCHMARK_MODES, Env:BENCHMARK_NETWORK_PROFILES, Env:BENCHMARK_WORKLOADS -ErrorAction SilentlyContinue
```

### Recalculating Results Without Rerunning Benchmarks

Если полные JSON-отчёты для выбранных факторов уже находятся в `artifacts/lighthouse/`, можно пересчитать сводку после изменения логики извлечения метрик:

```powershell
npm ci

$env:BENCHMARK_REUSE_REPORTS = 'true'

npm run benchmark:lighthouse

Remove-Item Env:BENCHMARK_REUSE_REPORTS
```

Пересчёт использует сохранённые отчёты и не запускает Chromium. Для выбранных фреймворков, режимов, сетевых профилей, нагрузок и числа запусков должны существовать соответствующие JSON-файлы. Имена файлов включают все эти факторы; старые отчёты без метаданных профиля можно загрузить в ML-приложение, но нельзя корректно использовать вместо новой матрицы.

## Приложение машинного обучения

Отдельное Streamlit-приложение находится в `ml_app/`. Оно загружает `samples.json` или полные Lighthouse JSON-отчёты, обучает Linear Regression, Random Forest и Gradient Boosting, сравнивает фактический и прогнозируемый LCP по MAE/RMSE/R² и позволяет интерактивно прогнозировать LCP по характеристикам страницы. Настройка окружения и запуск описаны в [ml_app/README.md](./ml_app/README.md).

В WSL из корня проекта запустите `make install`, `make test` и `make run`. Групповая cross-validation формирует прогнозы для всех измерений. Чтобы подключить данные, размещённые вне репозитория, задайте `LIGHTHOUSE_ARTIFACTS_DIR="/mnt/c/Users/<имя-пользователя>/lcp-benchmark-artifacts/lighthouse" make run`; приложение напрямую читает `samples.json` и отображает сводку из `summary.json`. Старые артефакты на 45 запусков в `artifacts/` содержат только legacy-данные.

Для каждого выбранного фреймворка, режима рендеринга и номера запуска должны существовать соответствующие JSON-файлы.

## Benchmark методология 

| Rendering Mode | How Content Is Generated |
|---|---|
| **CSR (Client-Side Rendering)** | Браузер загружает JavaScript, получает данные каталога через API и создаёт DOM. |
| **SSR (Server-Side Rendering)** | Сервер получает данные и возвращает HTML с карточками товаров. Затем страница гидратируется в браузере. |
| **SSG (Static Site Generation)** | HTML с карточками товаров генерируется во время сборки и отдаётся как предварительно отрендеренная страница. |

Для честного сравнения все конфигурации должны использовать:
- production-сборки;
- одинаковые данные о товарах;
- одинаковые изображения и вёрстку;
- одинаковые сетевые условия;
- одну и ту же конфигурацию Lighthouse.

**Сравнивайте медианные значения по нескольким запускам, а не отдельные измерения.**

Локальные значения TTFB отражают характеристики Docker-окружения и не должны интерпретироваться как типичная задержка публично размещённого production-приложения.

### Внешние сервисы тестирования

Внешние сервисы, такие как PageSpeed Insights и WebPageTest, не могут тестировать приложения, работающие на localhost или внутренних адресах вроде http://benchmark.

Для их использования необходим общедоступный веб-сайт.

## Данные каталога
Исходный набор товаров хранится в data/products.json.

Чтобы обновить каталог, выполните:

```powershell
npm ci
npm run catalog:update
docker compose up --build -d
```

Обновление каталога меняет условия эксперимента.

**Для воспроизводимых и корректных сравнений используйте только результаты бенчмарков, собранные на одном и том же наборе данных каталога.**
