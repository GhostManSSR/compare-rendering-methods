import sys
from pathlib import Path

import pandas as pd
import streamlit as st

APP_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(APP_DIR))

from experiment import (  # noqa: E402
    CATEGORICAL_FEATURES,
    FEATURES,
    NUMERIC_FEATURES,
    TARGET,
    default_samples_path,
    default_summary_path,
    default_numeric_values,
    evaluate_models,
    load_json_files,
    predict_lcp,
)

MODEL_NAMES = ["Linear Regression", "Random Forest", "Gradient Boosting"]
FRAMEWORKS = ["react", "vue", "angular"]
RENDERING_MODES = ["csr", "ssr", "ssg"]
NETWORK_PROFILES = {
    "fast-4g": {"networkRttMs": 20, "networkThroughputKbps": 10240},
    "regular-4g": {"networkRttMs": 40, "networkThroughputKbps": 4096},
    "slow-3g": {"networkRttMs": 150, "networkThroughputKbps": 1600},
}
WORKLOAD_PROFILES = {
    "light": {
        "extraDomCards": 0,
        "syntheticJsBytes": 0,
        "syntheticImageCount": 0,
        "syntheticImageBytes": 0,
        "syntheticImagesTotalBytes": 0,
        "imageWidth": 320,
        "syntheticDomNodes": 0,
    },
    "medium": {
        "extraDomCards": 24,
        "syntheticJsBytes": 24000,
        "syntheticImageCount": 6,
        "syntheticImageBytes": 16000,
        "syntheticImagesTotalBytes": 96000,
        "imageWidth": 480,
        "syntheticDomNodes": 79,
    },
    "heavy": {
        "extraDomCards": 60,
        "syntheticJsBytes": 96000,
        "syntheticImageCount": 24,
        "syntheticImageBytes": 64000,
        "syntheticImagesTotalBytes": 1536000,
        "imageWidth": 960,
        "syntheticDomNodes": 205,
    },
}
FEATURE_LABELS = {
    "networkRttMs": "Сетевая задержка RTT (мс)",
    "networkThroughputKbps": "Пропускная способность (Кбит/с)",
    "catalogItems": "Количество карточек каталога",
    "extraDomCards": "Дополнительные карточки нагрузки",
    "syntheticJsBytes": "Размер дополнительного JS (байт)",
    "syntheticImageCount": "Количество дополнительных изображений",
    "syntheticImageBytes": "Размер одного изображения (байт)",
    "syntheticImagesTotalBytes": "Общий размер изображений (байт)",
    "imageWidth": "Ширина изображения (пиксели)",
    "syntheticDomNodes": "Дополнительные DOM-узлы",
    "domNodes": "Размер DOM по Lighthouse (узлы)",
    "jsTransferBytes": "Переданный JavaScript (байт)",
    "imageTransferBytes": "Переданные изображения (байт)",
    "htmlTransferBytes": "Переданный HTML (байт)",
    "requestCount": "Количество сетевых запросов",
    "ttfbMs": "TTFB (мс)",
    "fcpMs": "FCP (мс)",
    "tbtMs": "TBT (мс)",
}

st.set_page_config(page_title="LCP ML Experiment", page_icon="📊", layout="wide")
st.title("Прогнозирование LCP методами машинного обучения")
st.caption(
    "Экспериментальные данные Lighthouse: рендеринг, сетевой профиль и нагрузка страницы."
)

uploaded_files = st.file_uploader(
    "Загрузите samples.json или JSON-отчёты Lighthouse",
    type=["json"],
    accept_multiple_files=True,
)

files = [(file.name, file.getvalue()) for file in uploaded_files]
default_path = default_samples_path()
default_summary = default_summary_path()
if not files:
    if default_path.is_file():
        files = [(default_path.name, default_path.read_bytes())]
    elif default_summary.is_file():
        files = [(default_summary.name, default_summary.read_bytes())]

if not files:
    st.info(
        "Загрузите JSON с измерениями. После запуска Lighthouse основной файл "
        "находится в artifacts/lighthouse/samples.json."
    )
    st.stop()

try:
    data, skipped = load_json_files(files)
except ValueError as error:
    st.error(str(error))
    st.stop()

if skipped:
    st.warning(f"Пропущено записей без положительного значения LCP: {skipped}.")

st.subheader("Состав набора")
overview = st.columns(4)
overview[0].metric("Измерения", len(data))
overview[1].metric("Конфигурации", data[CATEGORICAL_FEATURES].drop_duplicates().shape[0])
overview[2].metric("Фреймворки", data["framework"].nunique())
overview[3].metric("Режимы рендеринга", data["mode"].nunique())

legacy_data = (
    "legacy" in set(data["networkProfile"])
    or "legacy" in set(data["workload"])
)
if legacy_data:
    st.warning(
        "В наборе есть старые измерения без сетевого профиля и нагрузки (legacy). "
        "Чтобы получить прогнозы для fast-4g/regular-4g/slow-3g и light/medium/heavy, "
        "загрузите новый samples.json после полного запуска Lighthouse."
    )

if default_summary.is_file():
    try:
        summary_data = pd.read_json(default_summary)
    except (ValueError, OSError) as error:
        st.error(f"Не удалось прочитать сводку Lighthouse: {error}")
        st.stop()
    if not summary_data.empty:
        st.subheader("Сводные результаты эксперимента")
        st.caption(
            f"Источник: summary.json · {len(summary_data)} конфигураций · "
            f"{int(summary_data['runs'].sum())} измерений"
        )
        st.dataframe(
            summary_data,
            width="stretch",
            hide_index=True,
        )

try:
    model_results, comparison = evaluate_models(data)
except ValueError as error:
    st.error(str(error))
    st.stop()

st.subheader("Оценка на отложенных конфигурациях")
st.write(
    "Метрики рассчитаны по групповым пятиблочным cross-validation: все повторы "
    "одной конфигурации остаются в одном блоке. График включает каждое измерение."
)

metric_rows = [
    {
        "Модель": name,
        "MAE (мс)": result["MAE"],
        "RMSE (мс)": result["RMSE"],
        "R²": result["R²"],
    }
    for name, result in model_results.items()
]
st.dataframe(
    pd.DataFrame(metric_rows).set_index("Модель").style.format(
        {"MAE (мс)": "{:.2f}", "RMSE (мс)": "{:.2f}", "R²": "{:.3f}"}
    ),
    width="stretch",
)

comparison_rows = []
for name in MODEL_NAMES:
    for _, row in comparison.iterrows():
        comparison_rows.append(
            {
                "Модель": name,
                "Конфигурация": row["configuration"],
                "Фреймворк": row["framework"],
                "Рендеринг": row["mode"],
                "Сеть": row["networkProfile"],
                "Нагрузка": row["workload"],
                "Фактический LCP (мс)": row[TARGET],
                "Прогноз LCP (мс)": row[f"{name} prediction"],
            }
        )
comparison_view = pd.DataFrame(comparison_rows)
st.scatter_chart(
    comparison_view,
    x="Фактический LCP (мс)",
    y="Прогноз LCP (мс)",
    color="Модель",
)
with st.expander("Фактические и прогнозируемые значения"):
    st.write(f"Показано точек: {len(comparison_view):,} (все измерения для трёх моделей).")
    st.dataframe(comparison_view, width="stretch")

st.subheader("Интерактивное прогнозирование")
st.write(
    "Каждая модель ниже повторно обучена на всём загруженном наборе. "
    "Заполните параметры страницы и получите прогноз в миллисекундах."
)

selected_model = st.selectbox("Модель", MODEL_NAMES)
with st.form("prediction-form"):
    category_columns = st.columns(len(CATEGORICAL_FEATURES))
    prediction = {}
    for column, container in zip(CATEGORICAL_FEATURES, category_columns):
        if column == "framework":
            options = sorted(set(FRAMEWORKS) | set(data[column].astype(str)))
        elif column == "mode":
            options = sorted(set(RENDERING_MODES) | set(data[column].astype(str)))
        elif column == "networkProfile":
            options = sorted(set(NETWORK_PROFILES) | set(data[column].astype(str)))
        else:
            options = sorted(set(WORKLOAD_PROFILES) | set(data[column].astype(str)))
        prediction[column] = container.selectbox(
            {
                "framework": "Фреймворк",
                "mode": "Метод рендеринга",
                "networkProfile": "Сетевой профиль",
                "workload": "Нагрузка",
            }[column],
            options,
        )

    st.markdown("**Характеристики страницы и измеряемой среды**")
    numeric_columns = st.columns(3)
    network_preset = NETWORK_PROFILES.get(prediction["networkProfile"], {})
    workload_preset = WORKLOAD_PROFILES.get(prediction["workload"], {})
    configuration_defaults = default_numeric_values(data, prediction)
    for index, column in enumerate(NUMERIC_FEATURES):
        if column in network_preset:
            default = float(network_preset[column])
        elif column in workload_preset:
            default = float(workload_preset[column])
        else:
            default = configuration_defaults[column]
        step = 1.0 if column in {
            "catalogItems",
            "extraDomCards",
            "syntheticJsBytes",
            "syntheticImageCount",
            "syntheticImageBytes",
            "syntheticImagesTotalBytes",
            "imageWidth",
            "syntheticDomNodes",
            "domNodes",
            "jsTransferBytes",
            "imageTransferBytes",
            "htmlTransferBytes",
            "requestCount",
        } else 10.0
        prediction[column] = numeric_columns[index % 3].number_input(
            FEATURE_LABELS[column],
            value=default,
            min_value=0.0,
            step=step,
        )

    predict_clicked = st.form_submit_button("Рассчитать прогноз LCP")

if predict_clicked:
    prediction_frame = pd.DataFrame([prediction], columns=FEATURES)
    try:
        predicted_lcp = float(
            predict_lcp(
                model_results[selected_model]["model"],
                prediction_frame,
            ).iloc[0]
        )
    except ValueError as error:
        st.error(str(error))
    else:
        st.metric("Прогнозируемый LCP", f"{predicted_lcp:.2f} мс")

st.caption(
    "Для научного вывода используйте полный сбалансированный набор измерений; "
    "результаты зависят от окружения Lighthouse и выбранного разделения данных."
)
