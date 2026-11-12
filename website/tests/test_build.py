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
