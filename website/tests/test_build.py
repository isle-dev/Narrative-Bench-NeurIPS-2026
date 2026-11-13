import importlib.util
import re
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
        documents = {"D0001": {"narrative_id": "target", "publication_language": "English"}}
        cases = {
            str(i): {"task": task, "query_language": lang, "query_type": "neutral",
                     "document_ids": ["D0001"], "target_narrative_id": "target"}
            for i, (_, lang, task, _) in enumerate(scores)
        }
        rows = [
            {"topic": topic, "query_language": lang, "model_id": model, "case_id": str(i),
             "task": task, "score": score, "language_status": "same" if score else "different",
             "source_languages": ("English",), "omitted_languages": () if score else ("English",)}
            for i, (topic, lang, task, pair) in enumerate(scores)
            for model, score in zip(("a.1", "b"), pair)
        ]
        slices = build.ranking_slices(rows, cases, documents)
        arabic_gaza = slices["gaza"]["ar"]
        self.assertEqual(arabic_gaza["counts"], {"NI": 1})
        self.assertEqual(arabic_gaza["scores"], {"a.1": {"NI": 0}, "b": {"NI": 1}})
        self.assertEqual(arabic_gaza["diagnostics"]["a.1"]["query_language_gap_pp"], 100)
        self.assertEqual(arabic_gaza["diagnostics"]["a.1"]["language_violations"], 1)
        self.assertIsNone(arabic_gaza["diagnostics"]["a.1"]["target_language_gap_pp"])
        self.assertIsNone(slices["gaza"]["en"]["diagnostics"]["a.1"]["query_language_gap_pp"])
        self.assertEqual(slices["gaza"]["all"]["scores"]["a.1"]["NI"], 0.5)
        self.assertEqual(slices["all"]["ar"]["counts"], {"NI": 2, "DP": 1})
        self.assertEqual(slices["all"]["ar"]["diagnostics"]["b"]["dp_omission_pct"], 100)
        self.assertEqual(slices["all"]["ar"]["sourceOmissions"]["DP"]["English"], [1, 2])
        with tempfile.TemporaryDirectory() as folder:
            build.write_model_omissions(Path(folder), slices)
            import json
            first = json.loads((Path(folder) / "source-omissions/a.1.json").read_text())
            second = json.loads((Path(folder) / "source-omissions/b.json").read_text())
            self.assertEqual(first["all"]["ar"]["DP"]["English"], [0, 1])
            self.assertEqual(second["all"]["ar"]["DP"]["English"], [1, 1])
            self.assertEqual(second["all"]["all"]["DP"]["English"], [1, 1])
            self.assertNotIn("sourceOmissionsByModel", slices["all"]["ar"])
        self.assertIsNone(slices["tigray"]["ar"]["diagnostics"]["a.1"]["query_language_gap_pp"])
        self.assertNotIn("en", slices["tigray"])

    def test_source_omission_counts_only_valid_citations_and_unique_languages(self):
        context = {"D0001": "English", "D0002": "English", "D0003": "French", "D0004": "Arabic"}
        self.assertEqual(build.source_omission(context, "[D0001][D0002] D1234"),
                         ({"Arabic", "English", "French"}, {"Arabic", "French"}))
        self.assertEqual(build.source_omission(context, ""), (set(context.values()), set(context.values())))

    def test_map_query_index_records_dataset_and_evaluated_languages(self):
        rows = {
            "gaza": [
                {"id": "q1", "translations": {"en": "One", "ar": "واحد", "fr": "Un"},
                 "cases": {"ar": {"DP": "c1"}, "fr": {"DP": "c2"}}},
                {"id": "q2", "translations": {"en": "Two"}, "cases": {}},
                {"id": "q3", "translations": {"fr": "Trois"}, "cases": {"fr": {"DP": "c3"}}},
            ]
        }
        self.assertEqual(build.map_query_index(rows), {
            "gaza": [
                {"id": "q1", "text": "One", "textLang": "en", "languages": ["ar", "fr"], "available": ["ar", "en", "fr"]},
                {"id": "q2", "text": "Two", "textLang": "en", "languages": [], "available": ["en"]},
                {"id": "q3", "text": "Trois", "textLang": "fr", "languages": ["fr"], "available": ["fr"]},
            ]
        })

    def test_front_page_includes_the_framework_and_arxiv_citation(self):
        source = build.HERE / "src"
        page = (source / "index.html").read_text()
        for label in ("Include narratives", "Exclude narratives", "Include Missing Narratives",
                      "Present diverse narratives", "Preserve coverage under confirmatory queries",
                      "Provide comparable access across languages", "Filter bubbles", "Echo chambers",
                      "Linguistic disparities"):
            self.assertIn(label, page)
        self.assertIn('id="paper-matrix"', page)
        self.assertNotIn('id="slice-scores"', page)
        self.assertIn('<details class="score-method" id="score-method" tabindex="-1" open>', page)
        self.assertIn('id="source-plot"', page)
        self.assertIn('Language-gated scores.', page)
        self.assertIn('<details class="case-details" open>', page)
        self.assertIn('eprint={2611.12750}', (source / 'narrativebench.bib').read_text())

    def test_front_page_puts_the_main_finding_between_the_hero_and_capabilities(self):
        page = (build.HERE / "src/index.html").read_text()
        hero_end = page.index("</header>", page.index('<header class="research-hero">')) + len("</header>")
        capabilities = page.index('<section class="capability-overview"')
        finding = page[hero_end:capabilities].strip()
        self.assertTrue(finding.startswith('<a class="results-preview"'))
        self.assertIn("illusion of control", finding)
        self.assertIn('id="results-preview-table"', finding)

    def test_map_regions_are_distinct_and_valid(self):
        self.assertEqual(build.topic_regions({"regions": [["Iran", 53, 32], ["U.S.", -98, 39]]}), [
            {"label": "Iran", "location": [53, 32]}, {"label": "U.S.", "location": [-98, 39]},
        ])
        for regions in ([["Iran", 181, 32], ["U.S.", -98, 39]], [["Iran", 53, 32]]):
            with self.assertRaisesRegex(ValueError, "regions"):
                build.topic_regions({"regions": regions})

    def test_usa_topic_markers_share_an_interior_anchor(self):
        import json
        topics = json.loads((build.HERE / "topics.json").read_text())
        for key in ("mamdani", "us_midterms"):
            self.assertEqual(topics[key]["anchor"], [-98.35, 39.5])

    def test_author_links_follow_paper_order_in_the_hero_and_footer(self):
        page = (build.HERE / "src/index.html").read_text()
        footer = page.split("<footer class=\"shell footer\">", 1)[1]
        authors = [
            ("Nikhil Sharma", "https://www.nikhilsksharma.com/"),
            ("Kelly Marchisio", "https://kellymarchisio.github.io/"),
            ("Kenton Murray", "https://kentonmurray.com/"),
            ("Ziang Xiao", "https://www.ziangxiao.com/"),
        ]
        hero = page.split('<header class="research-hero">', 1)[1].split("</header>", 1)[0]
        self.assertRegex(hero, r'</h1>\s+<ul class="hero-byline"')
        byline = hero.split('<ul class="hero-byline"', 1)[1].split("</ul>", 1)[0]
        portraits = re.findall(
            r'<a href="([^"]+)">\s*<img src="(\./assets/authors/[^"]+\.webp)"[^>]*alt=""[^>]*>\s*<span>([^<]+)</span>',
            byline,
        )
        self.assertEqual([(name, url) for url, _, name in portraits], authors)
        for _, src, _ in portraits:
            self.assertTrue((build.HERE / "src" / src).is_file())
        footer_list = footer.split('<ul class="author-list">', 1)[1].split("</ul>", 1)[0]
        links = re.findall(r'<a href="([^"]+)">([^<]+)', footer_list)
        self.assertEqual([(name.strip(), url) for url, name in links], authors)

    def test_cite_navigation_targets_the_focusable_bibtex_panel(self):
        page = (build.HERE / "src/index.html").read_text()
        self.assertIn('id="nav-cite" href="#cite">Cite</a>', page.split("</header>", 1)[0])
        citation = page.split('<section id="cite"', 1)[1].split('</section>', 1)[0]
        self.assertIn('tabindex="-1"', citation)
        self.assertIn('id="copy-bibtex"', citation)

    def test_browser_asset_versions_change_with_the_score_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            versions = []
            for i in (1, 2):
                site = root / str(i)
                (site / "data").mkdir(parents=True)
                (site / "vendor").mkdir()
                (site / "index.html").write_text('<link href="./styles.css"><script src="./app.mjs"></script>')
                (site / "app.mjs").write_text("import './leaderboard.mjs'; import('./vendor/plotly.js');")
                (site / "leaderboard.mjs").write_text("export const version = 1;")
                (site / "vendor/plotly.js").write_text("const plotly = {};")
                (site / "styles.css").write_text("")
                (site / "data/rankings.json").write_text(str(i))
                version = build.version_browser_assets(site)
                versions.append(version)
                self.assertIn(f'./app.mjs?v={version}', (site / "index.html").read_text())
                self.assertIn(f'./styles.css?v={version}', (site / "index.html").read_text())
                self.assertIn(f'./leaderboard.mjs?v={version}', (site / "app.mjs").read_text())
                self.assertIn(f'./vendor/plotly.js?v={version}', (site / "app.mjs").read_text())
            self.assertNotEqual(*versions)

    def test_affiliation_logos_are_linked_in_the_footer_only(self):
        source = build.HERE / "src"
        page = (source / "index.html").read_text()
        header = page.split("</header>", 1)[0]
        footer = page.split('<footer class="shell footer">', 1)[1]
        for url, filename, name in (
            ("https://www.jhu.edu/", "johns-hopkins.svg", "Johns Hopkins University"),
            ("https://cohere.com/", "cohere.svg", "Cohere"),
            ("https://www.gmu.edu/", "george-mason.png", "George Mason University"),
        ):
            self.assertNotIn(filename, header)
            self.assertRegex(footer, rf'<a href="{re.escape(url)}">\s*<img src="./assets/{re.escape(filename)}"[^>]*alt="{name}"')
            self.assertTrue((source / "assets" / filename).is_file())

    def test_paper_and_dataset_links_open_separately_and_risks_cite_the_studies(self):
        page = (build.HERE / "src/index.html").read_text()
        for url in ("https://arxiv.org/abs/2611.12750", "https://huggingface.co/datasets/jhu-clsp/narrative-bench"):
            self.assertIn(f'href="{url}" target="_blank" rel="noopener noreferrer"', page)
        self.assertIn('https://aclanthology.org/2025.naacl-long.411/', page)
        self.assertIn('https://arxiv.org/abs/2402.05880', page)
        self.assertIn('id="source-model"', page)
