# Приложение для эксперимента LCP

Приложение загружает JSON-выборки Lighthouse, обучает Linear Regression,
Random Forest и Gradient Boosting, сравнивает фактический и прогнозируемый LCP
по MAE, RMSE и R², оценивает взаимную информацию технических признаков с LCP,
сравнивает распределения и энтропию LCP между режимами рендеринга и позволяет
интерактивно прогнозировать LCP.

## Запуск в WSL

Из корня репозитория:

```bash
make install
make run
```

Приложение автоматически использует `artifacts/lighthouse/samples.json` и
показывает сводную таблицу из `summary.json`, если эти файлы есть в рабочей
копии. В ином случае загрузите `samples.json` или один или несколько JSON-отчётов
Lighthouse через форму. Для результатов, хранящихся отдельно от репозитория,
задайте `LIGHTHOUSE_ARTIFACTS_DIR` до запуска:

```bash
LIGHTHOUSE_ARTIFACTS_DIR=/mnt/c/Users/Arti/lcp-benchmark-artifacts/lighthouse make run
```

Этот путь можно заменить на каталог с вашими `samples.json` и `summary.json`.

Оценка выполняется на группах экспериментальных конфигураций
(фреймворк, режим рендеринга, сеть, нагрузка), а не на случайно перемешанных
повторах одной конфигурации. Пятиблочная GroupKFold cross-validation формирует
out-of-fold прогноз для каждого измерения, поэтому на графике отображаются все
конфигурации и повторы, а не только один случайный holdout.

Сетевые профили и уровни нагрузки доступны в прогнозировании всегда. Если
загружен старый набор без этих измерений, приложение предупредит, что прогнозы
для новых профилей являются экстраполяцией; для корректной оценки загрузите
новый `samples.json` после запуска полного эксперимента. Числовые поля
характеристик ограничены неотрицательными значениями, а отрицательный вывод
модели ограничивается нулём, поскольку отрицательный LCP физически невозможен.

В разделе анализа доступны тепловая карта взаимной информации признаков с LCP,
ранжирование признаков и сравнение гистограмм/энтропии LCP по режимам. Энтропия
считается по общим интервалам гистограммы и описывает наблюдаемую выборку, но не
доказывает причинность. Нормализованные измерения можно скачать в CSV или JSON.

## Установка и тесты в WSL

Из корня репозитория:

```bash
make install
make test
make run
```

`make test` проверяет три модели на полной матрице сетевых профилей и нагрузок
(81 сочетание фреймворка, рендеринга, сети и нагрузки).
Для короткого smoke-теста или подматрицы укажите параметры:

```bash
make test-smoke
make test-matrix NETWORK_PROFILES=slow-3g WORKLOADS=heavy
```

Makefile создаёт отдельное окружение `ml_app/.venv`, чтобы не изменять пакеты
системного Python в WSL. Тесты запускаются в GitHub Actions при изменениях
Python-приложения или Makefile.

## Поля JSON

Основной формат — массив объектов из `samples.json`. Требуется `lcpMs`;
предпочтительные признаки: `framework`, `mode`, `networkProfile`, `workload`,
`networkRttMs`, `networkThroughputKbps`, `syntheticJsBytes`,
`syntheticImageCount`, `syntheticImageBytes`, `syntheticDomNodes`,
`jsTransferBytes`, `cssTransferBytes`, `imageTransferBytes`, `domNodes`,
`requestCount`, а также `scriptRequestCount`, `stylesheetRequestCount`,
`imageRequestCount`, `fontRequestCount`, `documentRequestCount`,
`xhrRequestCount`, `fetchRequestCount`, `mediaRequestCount` и
`otherRequestCount`; также поддерживаются `ttfbMs`, `fcpMs` и `tbtMs`.
Поддерживаются и исходные Lighthouse JSON-отчёты; метаданные профиля в них
берутся из URL отчёта, а недостающие поля обрабатываются импьютером модели.
