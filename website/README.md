# NarrativeBench Explorer

The static site is built from the public dataset revision pinned in [release.json](release.json). The build verifies the release file hashes, the evaluation inputs, and every saved answer and score with the benchmark scorer. Only the site files and the released data fields displayed by the site are packaged. Source article text is used for validation during the build. Article links and attribution appear in the explorer.

The map uses illustrative topic anchors on a rotatable orthographic globe and [Natural Earth 1:110m country polygons](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/), in the public domain. Anchors indicate where topics are discussed or situated. U.S. domestic topics share an interior anchor so their queries can be browsed together. Dotted lines connect representative locations for the named regions in a selected conflict. They are undirected and show geographic context. The benchmark does not record the location of each person who asked a question. Diamond counts represent distinct questions in the current map language and coverage scope. Each group opens a query list. Choose Benchmark to explore recorded evaluations or Entire dataset to browse all released language versions, including those without recorded answers. The map language filter starts at All languages and is independent of the language used for the selected answer. Cross-regional queries are available from the map footer.

The leaderboard filters the released cases by topic and query language, with the matched case count shown for each task. The unfiltered Plotly matrix reproduces the 15 rows, 11 columns, standard errors, and color bins of Table 1. The published values in [paper-results.json](paper-results.json) were checked against the PDF identified by its SHA-256. The site build compares the displayed aggregate point estimates for all 11 columns with the pinned release. The same matrix shows filtered point estimates for the matching cases. A single non-English query language uses English within the same topic scope as its comparison for Query gap. Gaps with insufficient coverage appear as unavailable. The Task rankings chart keeps its layout when no cases match.

The unmodified horizontal Johns Hopkins University logo is from the [University Communications download library](https://brand.jhu.edu/resources/download-library/?category=219&search=university). The site hosts Work Sans and Source Serif 4 locally under their bundled font licenses.

## Run locally

Use Python 3.12 and Node.js 22. Run these commands from the repository root.

```bash
npm ci --prefix website --ignore-scripts
python -m pip install -r website/requirements.txt
python -m unittest discover -s website/tests
node --test website/tests/*.test.mjs
python website/build.py
python -m http.server 8000 --bind 127.0.0.1 --directory website/dist
```

Open <http://127.0.0.1:8000/>. The build downloads the pinned public data by default. Pass `--release /path/to/benchmark` to reuse a local copy and `--output /path/to/new-directory` to build into a fresh directory.

## Publish

The [Pages workflow](../.github/workflows/pages.yml) tests and builds explorer changes on pull requests. After an update to `main`, it publishes the generated directory. The repository's Pages source is GitHub Actions. The deployed site needs no credentials, backend, or third-party requests during browsing.
