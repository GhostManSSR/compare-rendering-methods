# Сравнение CSR, SSR и SSG: React, Vue и Angular

Стенд для измерения производительности девяти вариантов рендеринга каталога из 12 товаров. Все приложения используют одинаковые данные из `data/products.json`, изображения и макет. Production-версии доступны через один Nginx и общий origin.

## Требования

- Docker Desktop с Docker Compose
- Node.js 22 и npm — для локальных команд

## Запуск

```powershell
docker compose up --build -d
```

Проверка готовности: http://localhost:8080/health

| Фреймворк | CSR | SSR | SSG |
|---|---|---|---|
| React | [CSR](http://localhost:8080/react/csr) | [SSR](http://localhost:8080/react/ssr) | [SSG](http://localhost:8080/react/ssg) |
| Vue | [CSR](http://localhost:8080/vue/csr) | [SSR](http://localhost:8080/vue/ssr) | [SSG](http://localhost:8080/vue/ssg) |
| Angular | [CSR](http://localhost:8080/angular/csr) | [SSR](http://localhost:8080/angular/ssr) | [SSG](http://localhost:8080/angular/ssg) |

Для остановки:

```powershell
docker compose down
```

## Измерения Lighthouse

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

После проверки очистите переменные текущей сессии PowerShell при необходимости:

```powershell
Remove-Item Env:BENCHMARK_RUNS, Env:BENCHMARK_FRAMEWORKS, Env:BENCHMARK_MODES, Env:BENCHMARK_NETWORK_PROFILES, Env:BENCHMARK_WORKLOADS -ErrorAction SilentlyContinue
```

### Пересчёт без повторных измерений

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

## Методика сравнения

| Режим | Как формируется содержимое |
|---|---|
| **CSR** | Браузер загружает JavaScript, получает каталог через API и строит DOM. |
| **SSR** | Сервер получает данные и возвращает HTML с карточками; затем выполняется гидратация. |
| **SSG** | HTML с карточками создаётся во время сборки и выдаётся как готовая страница. |

Для корректного сравнения используйте одинаковые production-сборки, данные, изображения, условия сети и настройки Lighthouse. Сопоставляйте медианы нескольких запусков, а не единичные результаты. Локальные значения TTFB относятся к Docker-окружению и не характеризуют задержку публичного хостинга.

Внешние сервисы PageSpeed Insights и WebPageTest не могут измерять локальный `localhost` или внутренний адрес `http://benchmark`: для них нужен публично доступный сайт.

## Данные каталога

Исходный набор товаров хранится в `data/products.json`. Для его обновления (при наличии установленных npm-зависимостей):

```powershell
npm ci
npm run catalog:update
docker compose up --build -d
```

Обновление данных меняет условия эксперимента; сравнивайте только результаты, полученные на одинаковом наборе товаров.
