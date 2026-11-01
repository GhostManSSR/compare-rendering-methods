import json
import math
import os
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

CATEGORICAL_FEATURES = [
    "framework",
    "mode",
    "networkProfile",
    "workload",
]

NUMERIC_FEATURES = [
    "networkRttMs",
    "networkThroughputKbps",
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
    "ttfbMs",
    "fcpMs",
    "tbtMs",
]

FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES
TARGET = "lcpMs"

NETWORK_METADATA = {
    "fast-4g": (20, 10240),
    "regular-4g": (40, 4096),
    "slow-3g": (150, 1600),
}
WORKLOAD_METADATA = {
    "light": (0, 0, 0, 0, 0),
    "medium": (24, 24000, 6, 16000, 79),
    "heavy": (60, 96000, 24, 64000, 205),
}


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _sample_from_record(record: dict[str, Any]) -> dict[str, Any] | None:
    lcp = _number(record.get("lcpMs", record.get("lcpMedianMs")))
    if lcp is None or lcp <= 0:
        return None

    sample: dict[str, Any] = {
        "framework": record.get("framework") or "unknown",
        "mode": record.get("mode") or "unknown",
        "networkProfile": record.get("networkProfile") or "legacy",
        "workload": record.get("workload") or "legacy",
        "lcpMs": lcp,
    }

    aliases = {
        "networkRttMs": ("networkRttMs",),
        "networkThroughputKbps": ("networkThroughputKbps",),
        "catalogItems": ("catalogItems",),
        "extraDomCards": ("extraDomCards",),
        "syntheticJsBytes": ("syntheticJsBytes",),
        "syntheticImageCount": ("syntheticImageCount",),
        "syntheticImageBytes": ("syntheticImageBytes",),
        "syntheticImagesTotalBytes": ("syntheticImagesTotalBytes",),
        "imageWidth": ("imageWidth",),
        "syntheticDomNodes": ("syntheticDomNodes",),
        "domNodes": ("domNodes", "domNodesMedian"),
        "jsTransferBytes": ("jsTransferBytes", "jsTransferMedianBytes"),
        "imageTransferBytes": (
            "imageTransferBytes",
            "imageTransferMedianBytes",
        ),
        "htmlTransferBytes": ("htmlTransferBytes", "htmlTransferMedianBytes"),
        "requestCount": ("requestCount", "requestsMedian"),
        "ttfbMs": ("ttfbMs", "ttfbMedianMs"),
        "fcpMs": ("fcpMs", "fcpMedianMs"),
        "tbtMs": ("tbtMs", "tbtMedianMs"),
    }
    for feature, names in aliases.items():
        sample[feature] = _number(next((record[name] for name in names if name in record), None))

    if sample["catalogItems"] is None:
        sample["catalogItems"] = 12
    network_metadata = NETWORK_METADATA.get(sample["networkProfile"])
    if network_metadata:
        sample["networkRttMs"] = sample["networkRttMs"] or network_metadata[0]
        sample["networkThroughputKbps"] = (
            sample["networkThroughputKbps"] or network_metadata[1]
        )
    workload_metadata = WORKLOAD_METADATA.get(sample["workload"])
    if workload_metadata:
        for feature, value in zip(
            (
                "extraDomCards",
                "syntheticJsBytes",
                "syntheticImageCount",
                "syntheticImageBytes",
                "syntheticDomNodes",
            ),
            workload_metadata,
        ):
            if sample[feature] is None:
                sample[feature] = value
        if sample["syntheticImagesTotalBytes"] is None:
            sample["syntheticImagesTotalBytes"] = (
                sample["syntheticImageCount"] * sample["syntheticImageBytes"]
            )
        if sample["imageWidth"] is None:
            sample["imageWidth"] = {"light": 320, "medium": 480, "heavy": 960}[
                sample["workload"]
            ]

    return sample


def _report_to_record(report: dict[str, Any]) -> dict[str, Any]:
    audits = report.get("audits") or {}
    requests = (audits.get("network-requests") or {}).get("details", {}).get(
        "items", []
    )
    report_url = report.get("finalDisplayedUrl") or report.get("requestedUrl") or ""
    parsed_url = urlparse(report_url)
    path_parts = [part for part in parsed_url.path.split("/") if part]
    query = parse_qs(parsed_url.query)
    def metric(audit_name: str) -> float | None:
        return _number((audits.get(audit_name) or {}).get("numericValue"))

    def transfer(resource_type: str) -> float:
        return sum(
            _number(request.get("transferSize")) or 0
            for request in requests
            if request.get("resourceType") == resource_type
        )

    framework = path_parts[0] if path_parts and path_parts[0] in {
        "react",
        "vue",
        "angular",
    } else "unknown"
    mode = path_parts[1] if len(path_parts) > 1 and path_parts[1] in {
        "csr",
        "ssr",
        "ssg",
    } else "unknown"

    return {
        "framework": framework,
        "mode": mode,
        "networkProfile": (query.get("networkProfile") or ["legacy"])[0],
        "workload": (query.get("workload") or ["legacy"])[0],
        "lcpMs": metric("largest-contentful-paint"),
        "ttfbMs": metric("server-response-time"),
        "fcpMs": metric("first-contentful-paint"),
        "tbtMs": metric("total-blocking-time"),
        "domNodes": metric("dom-size"),
        "requestCount": len(requests),
        "jsTransferBytes": transfer("Script"),
        "imageTransferBytes": transfer("Image"),
        "htmlTransferBytes": transfer("Document"),
        "catalogItems": 12,
    }


def records_from_json(payload: Any, filename: str = "samples.json") -> list[dict[str, Any]]:
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict) and isinstance(payload.get("samples"), list):
        records = payload["samples"]
    elif isinstance(payload, dict) and isinstance(payload.get("audits"), dict):
        records = [_report_to_record(payload)]
    else:
        raise ValueError(
            f"{filename}: JSON must contain a sample list, a 'samples' list, "
            "or a Lighthouse report"
        )

    normalized = []
    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            raise ValueError(f"{filename}: sample {index} is not a JSON object")
        sample = _sample_from_record(record)
        if sample is not None:
            normalized.append(sample)
    return normalized


def load_json_files(files: list[tuple[str, bytes]]) -> tuple[pd.DataFrame, int]:
    records: list[dict[str, Any]] = []
    skipped = 0
    for filename, content in files:
        try:
            payload = json.load(BytesIO(content))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValueError(f"{filename}: invalid JSON ({error})") from error
        parsed = records_from_json(payload, filename)
        input_records = (
            payload
            if isinstance(payload, list)
            else payload.get("samples", [])
            if isinstance(payload, dict) and isinstance(payload.get("samples"), list)
            else [payload]
        )
        skipped += len(input_records) - len(parsed)
        records.extend(parsed)

    if not records:
        raise ValueError("No samples with a valid positive LCP value were found.")

    frame = pd.DataFrame(records)
    for column in FEATURES:
        if column in CATEGORICAL_FEATURES:
            frame[column] = frame[column].fillna("unknown").astype(str)
        else:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame, skipped


def _make_pipeline(model_name: str) -> Pipeline:
    estimators = {
        "Linear Regression": LinearRegression(),
        "Random Forest": RandomForestRegressor(
            n_estimators=300,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        ),
        "Gradient Boosting": GradientBoostingRegressor(
            n_estimators=150,
            learning_rate=0.05,
            max_depth=2,
            random_state=42,
        ),
    }
    if model_name not in estimators:
        raise ValueError(f"Unknown model: {model_name}")

    preprocessing = ColumnTransformer(
        transformers=[
            (
                "categorical",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("encoder", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                CATEGORICAL_FEATURES,
            ),
            (
                "numeric",
                Pipeline(
                    [
                        (
                            "imputer",
                            SimpleImputer(
                                strategy="median",
                                keep_empty_features=True,
                            ),
                        ),
                        ("scaler", StandardScaler()),
                    ]
                ),
                NUMERIC_FEATURES,
            ),
        ]
    )
    return Pipeline(
        [("preprocessing", preprocessing), ("regressor", estimators[model_name])]
    )


def predict_lcp(model: Any, features: pd.DataFrame) -> pd.Series:
    predictions = model.predict(features)
    if not all(math.isfinite(float(value)) for value in predictions):
        raise ValueError("The model returned a non-finite LCP prediction.")
    return pd.Series(
        [max(0.0, float(value)) for value in predictions],
        index=features.index,
    )


def default_numeric_values(
    frame: pd.DataFrame, configuration: dict[str, str]
) -> dict[str, float]:
    selected_rows = frame
    for column in CATEGORICAL_FEATURES:
        selected_rows = selected_rows[
            selected_rows[column].astype(str).eq(str(configuration[column]))
        ]

    if selected_rows.empty:
        selected_rows = frame

    defaults = {}
    for column in NUMERIC_FEATURES:
        if column not in selected_rows:
            defaults[column] = 0.0
            continue
        values = pd.to_numeric(selected_rows[column], errors="coerce").dropna()
        defaults[column] = float(values.median()) if not values.empty else 0.0
    return defaults


def evaluate_models(
    frame: pd.DataFrame,
) -> tuple[dict[str, dict[str, Any]], pd.DataFrame]:
    if len(frame) < 10:
        raise ValueError("At least 10 valid measurements are required.")

    groups = frame[CATEGORICAL_FEATURES].astype(str).agg("|".join, axis=1)
    if groups.nunique() < 2:
        raise ValueError("At least two distinct experimental configurations are required.")

    splitter = GroupKFold(n_splits=min(5, groups.nunique()))
    results: dict[str, dict[str, Any]] = {}
    prediction_rows = frame[
        ["framework", "mode", "networkProfile", "workload", TARGET]
    ].copy()
    prediction_rows.insert(
        0,
        "configuration",
        frame[CATEGORICAL_FEATURES].astype(str).agg(" / ".join, axis=1),
    )

    for name in ["Linear Regression", "Random Forest", "Gradient Boosting"]:
        out_of_fold_predictions = pd.Series(float("nan"), index=frame.index)
        for train_indices, test_indices in splitter.split(
            frame[FEATURES], frame[TARGET], groups
        ):
            evaluation_model = _make_pipeline(name)
            train = frame.iloc[train_indices]
            test = frame.iloc[test_indices]
            evaluation_model.fit(train[FEATURES], train[TARGET])
            out_of_fold_predictions.iloc[test_indices] = predict_lcp(
                evaluation_model, test[FEATURES]
            ).to_numpy()

        predicted = out_of_fold_predictions.to_numpy()
        prediction_rows[f"{name} prediction"] = predicted

        results[name] = {
            "MAE": mean_absolute_error(frame[TARGET], predicted),
            "RMSE": math.sqrt(mean_squared_error(frame[TARGET], predicted)),
            "R²": (
                r2_score(frame[TARGET], predicted)
                if len(frame) > 1
                else float("nan")
            ),
            "model": _make_pipeline(name).fit(frame[FEATURES], frame[TARGET]),
        }

    if prediction_rows.filter(like=" prediction").isna().any().any():
        raise RuntimeError("Cross-validation did not predict every measurement.")

    return results, prediction_rows.reset_index(drop=True)


def default_artifacts_dir() -> Path:
    configured_directory = os.environ.get("LIGHTHOUSE_ARTIFACTS_DIR")
    if configured_directory:
        return Path(configured_directory).expanduser().resolve()
    return Path(__file__).resolve().parents[1] / "artifacts" / "lighthouse"


def default_samples_path() -> Path:
    return default_artifacts_dir() / "samples.json"


def default_summary_path() -> Path:
    return default_artifacts_dir() / "summary.json"
