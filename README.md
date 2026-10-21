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

Рекомендуемый способ — Chromium внутри Docker. Он не зависит от локальной установки Chrome и проверяет все девять маршрутов по пять раз (всего 45 запусков).

```powershell
docker compose --profile tools build lighthouse-runner
docker compose --profile tools run --rm lighthouse-runner
```

По умолчанию результаты сохраняются в `artifacts/lighthouse/`:

- `react-csr-1.json` и аналогичные файлы — полные отчёты отдельных запусков;
- `samples.json` — метрики каждого запуска;
- `summary.json` и `summary.csv` — сводные медианы по фреймворкам и режимам.

В сводке представлены LCP, TTFB, FCP, TBT, число сетевых запросов, переданный объём JS/HTML, количество браузерных запросов к API, их задержка и LCP-элемент (если Lighthouse его определил). Пустая задержка API означает отсутствие доступного измерения, **не нулевую задержку**. При SSR/SSG запрос каталога может выполняться на сервере или при сборке и не попадать в сетевые запросы браузера.

Число запусков можно изменить от 5 до 10, а тест ограничить конкретным вариантом:

```powershell
$env:BENCHMARK_RUNS = '5'
$env:BENCHMARK_FRAMEWORKS = 'react'
$env:BENCHMARK_MODES = 'ssg'
docker compose --profile tools run --rm lighthouse-runner
```

После проверки очистите переменные текущей сессии PowerShell при необходимости:

```powershell
Remove-Item Env:BENCHMARK_RUNS, Env:BENCHMARK_FRAMEWORKS, Env:BENCHMARK_MODES -ErrorAction SilentlyContinue
```

### Пересчёт без повторных измерений

Если исходные JSON уже находятся в `artifacts/lighthouse/`, можно обновить сводку после изменения логики извлечения метрик:

```powershell
npm ci
$env:BENCHMARK_REUSE_REPORTS = 'true'
npm run benchmark:lighthouse
Remove-Item Env:BENCHMARK_REUSE_REPORTS
```

Пересчёт использует сохранённые отчёты и не запускает Chromium. Для выбранных фреймворков, режимов и числа запусков должны существовать соответствующие JSON-файлы.

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
