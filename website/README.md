# NarrativeBench Explorer

The static site is built from the public dataset revision pinned in [release.json](release.json). The build verifies the release file hashes, the evaluation inputs, and every saved answer and score with the benchmark scorer. Only the site files and the released data fields displayed by the site are packaged. Source article text is used for validation during the build. Article links and attribution appear in the explorer.

The map uses illustrative topic anchors on a rotatable orthographic globe and [Natural Earth 1:110m country polygons](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/), in the public domain. Anchors indicate where topics are discussed or situated. The benchmark does not record the location of each person who asked a question. Diamonds open the evaluated queries for the selected topic and language. The diamonds are grouped around the topic anchor. Topics without a single geographic anchor are accessible through the topic menu and its query list.

The leaderboard filters the released cases by topic and query language, with the matched case count shown for each task. Its unfiltered values match the five task score columns in Table 1 of the paper.

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
