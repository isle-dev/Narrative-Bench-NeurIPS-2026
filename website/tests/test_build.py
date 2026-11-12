import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "build.py"
SPEC = importlib.util.spec_from_file_location("build_explorer", MODULE)
build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build)


class BuildTests(unittest.TestCase):
    def test_verifies_release_input_hashes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "data.json"
            path.write_text("wrong")
            with self.assertRaisesRegex(ValueError, "does not match"):
                build.verify_input(path, "0" * 64)

    def test_citation_urls_allow_only_public_http_links(self):
        self.assertEqual(build.article_url("https://example.org/a"), "https://example.org/a")
        for value in ("javascript:alert(1)", "//example.org/a", "https://user:pass@example.org",
                      "https://example.org/\na", "https://127.0.0.1/a", "https://127.1/a", "https://localhost/a"):
            with self.subTest(value=value):
                self.assertIsNone(build.article_url(value))

    def test_detects_duplicate_keys(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            build.index_rows([{"id": "a"}, {"id": "a"}], "id")

    def test_projection_matches_map_coordinate_convention(self):
        self.assertEqual(build.project(-180, 84), [0, 0])
        self.assertEqual(build.project(180, -60), [1000, 400])
        self.assertEqual(build.project(0, 12), [500, 200])

    def test_rankings_use_paired_cases_for_topic_language_and_joint_filters(self):
        scores = [
            ("gaza", "ar", "NI", (0, 1)),
            ("gaza", "en", "NI", (1, 0)),
            ("tigray", "ar", "NI", (0.5, 0.5)),
            ("tigray", "ar", "DP", (0.25, 0)),
        ]
        rows = [
            {"topic": topic, "query_language": lang, "model_id": model,
             "task": task, "score": score, "language_status": "same" if score else "no_answer"}
            for topic, lang, task, pair in scores
            for model, score in zip(("a", "b"), pair)
        ]
        slices = build.ranking_slices(rows)
        self.assertEqual(slices["gaza"]["ar"], {
            "counts": {"NI": 1}, "scores": {"a": {"NI": 0}, "b": {"NI": 1}},
        })
        self.assertEqual(slices["gaza"]["all"]["scores"]["a"]["NI"], 0.5)
        self.assertEqual(slices["all"]["ar"]["counts"], {"NI": 2, "DP": 1})
        self.assertNotIn("en", slices["tigray"])
