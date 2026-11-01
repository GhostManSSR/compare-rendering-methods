import json
import os
import unittest
from itertools import product
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from experiment import (
    CATEGORICAL_FEATURES,
    FEATURES,
    evaluate_models,
    default_artifacts_dir,
    default_numeric_values,
    default_samples_path,
    default_summary_path,
    load_json_files,
    predict_lcp,
    records_from_json,
)


class ExperimentDataTests(unittest.TestCase):
    def test_artifact_paths_follow_environment_directory(self):
        expected = Path.cwd() / "test-lighthouse-artifacts"
        with patch.dict(
            os.environ,
            {"LIGHTHOUSE_ARTIFACTS_DIR": str(expected)},
        ):
            self.assertEqual(default_artifacts_dir(), expected)
            self.assertEqual(default_samples_path(), expected / "samples.json")
            self.assertEqual(default_summary_path(), expected / "summary.json")

    def test_samples_are_normalized_and_legacy_features_are_missing(self):
        frame, skipped = load_json_files(
            [
                (
                    "samples.json",
                    b'[{"framework":"react","mode":"csr","run":1,"lcpMs":1250},'
                    b'{"framework":"vue","mode":"ssr","lcpMs":null}]',
                )
            ]
        )

        self.assertEqual(len(frame), 1)
        self.assertEqual(skipped, 1)
        self.assertEqual(frame.iloc[0]["networkProfile"], "legacy")
        self.assertEqual(frame.iloc[0]["lcpMs"], 1250)

    def test_lighthouse_report_is_extracted(self):
        report = {
            "requestedUrl": (
                "http://localhost:8080/react/csr"
                "?networkProfile=slow-3g&workload=heavy"
            ),
            "audits": {
                "largest-contentful-paint": {"numericValue": 2100},
                "network-requests": {
                    "details": {
                        "items": [
                            {"resourceType": "Script", "transferSize": 1000},
                            {"resourceType": "Image", "transferSize": 2000},
                        ]
                    }
                },
            },
        }

        sample = records_from_json(report, "react-csr-report.json")[0]
        self.assertEqual(sample["framework"], "react")
        self.assertEqual(sample["networkProfile"], "slow-3g")
        self.assertEqual(sample["workload"], "heavy")
        self.assertEqual(sample["jsTransferBytes"], 1000)
        self.assertEqual(sample["imageTransferBytes"], 2000)
        self.assertEqual(sample["networkRttMs"], 150)
        self.assertEqual(sample["syntheticJsBytes"], 96000)
        self.assertEqual(sample["syntheticDomNodes"], 205)

    def test_models_train_and_evaluate_by_configuration_group(self):
        network_profiles = os.environ.get(
            "LCP_TEST_NETWORK_PROFILES",
            "fast-4g,regular-4g,slow-3g",
        ).split(",")
        workloads = os.environ.get(
            "LCP_TEST_WORKLOADS",
            "light,medium,heavy",
        ).split(",")
        self.assertTrue(set(network_profiles) <= {"fast-4g", "regular-4g", "slow-3g"})
        self.assertTrue(set(workloads) <= {"light", "medium", "heavy"})
        rows = []
        for framework, mode, network_profile, workload in product(
            ("react", "vue", "angular"),
            ("csr", "ssr", "ssg"),
            network_profiles,
            workloads,
        ):
            workload_index = ("light", "medium", "heavy").index(workload)
            network_index = (
                "fast-4g",
                "regular-4g",
                "slow-3g",
            ).index(network_profile)
            for run in range(5):
                rows.append({
                    "framework": framework,
                    "mode": mode,
                    "networkProfile": network_profile,
                    "workload": workload,
                    "networkRttMs": (20, 40, 150)[network_index],
                    "networkThroughputKbps": (10240, 4096, 1600)[network_index],
                    "lcpMs": (
                        800
                        + run * 10
                        + len(framework) * 20
                        + workload_index * 300
                        + network_index * 250
                    ),
                    "syntheticJsBytes": (0, 24000, 96000)[workload_index],
                    "syntheticImageCount": (0, 6, 24)[workload_index],
                    "syntheticImageBytes": (0, 16000, 64000)[workload_index],
                    "syntheticDomNodes": (0, 79, 205)[workload_index],
                })

        frame, _ = load_json_files(
            [("samples.json", json.dumps(rows).encode())]
        )
        results, predictions = evaluate_models(frame)

        self.assertEqual(
            set(results),
            {"Linear Regression", "Random Forest", "Gradient Boosting"},
        )
        expected_configurations = (
            3 * 3 * len(network_profiles) * len(workloads)
        )
        self.assertEqual(len(predictions), len(frame))
        self.assertEqual(
            predictions[CATEGORICAL_FEATURES].drop_duplicates().shape[0],
            expected_configurations,
        )
        self.assertEqual(set(frame["networkProfile"]), set(network_profiles))
        self.assertEqual(set(frame["workload"]), set(workloads))
        self.assertTrue(
            (predictions.filter(like=" prediction") >= 0).all().all()
        )
        self.assertTrue(all(result["MAE"] >= 0 for result in results.values()))

    def test_negative_model_output_is_clamped_to_zero(self):
        class NegativeModel:
            def predict(self, features):
                return [-6100.0] * len(features)

        features = pd.DataFrame([{column: 0 for column in FEATURES}])
        self.assertEqual(predict_lcp(NegativeModel(), features).iloc[0], 0.0)

    def test_numeric_defaults_use_the_selected_configuration(self):
        frame = pd.DataFrame(
            [
                {
                    "framework": "angular",
                    "mode": "csr",
                    "networkProfile": "fast-4g",
                    "workload": "heavy",
                    "fcpMs": 720.0,
                    "tbtMs": 30.0,
                },
                {
                    "framework": "angular",
                    "mode": "csr",
                    "networkProfile": "fast-4g",
                    "workload": "heavy",
                    "fcpMs": 680.0,
                    "tbtMs": 10.0,
                },
                {
                    "framework": "react",
                    "mode": "ssr",
                    "networkProfile": "slow-3g",
                    "workload": "light",
                    "fcpMs": 2000.0,
                    "tbtMs": 0.0,
                },
            ]
        )

        defaults = default_numeric_values(
            frame,
            {
                "framework": "angular",
                "mode": "csr",
                "networkProfile": "fast-4g",
                "workload": "heavy",
            },
        )

        self.assertEqual(defaults["fcpMs"], 700.0)
        self.assertEqual(defaults["tbtMs"], 20.0)


if __name__ == "__main__":
    unittest.main()
