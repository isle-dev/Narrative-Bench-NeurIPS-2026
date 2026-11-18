# NarrativeBench Explorer

The website compares the published NarrativeBench evaluations with six Gemini 4 configurations and three Full Hard configurations. Readers can filter the tables and rankings by topic and query language, inspect recorded answers, compare source-language omissions, and explore language disparities in Plotly.

## Evaluations

NarrativeBench retains the 4,800 original evaluation cases across 460 questions, 23 topics, and 24 query languages. Its leaderboard includes the 15 published configurations and the six Gemini 4 follow-up runs.

NarrativeBench Full Hard supplies every released article for each topic. Contexts grow from 24 to 59 articles on average and reach 238 articles, while preserving the questions, tasks, and labeled narratives. Full Hard changes article count and order. Hydrogen XHigh and Argon Low have 4,800 responses each. Carbon High has 4,529 completed responses and 271 failed requests. Tables and tooltips use the completed case counts for each model and task.

The language-disparity view plots the mean absolute score gap from English for query languages against the corresponding gap for target narrative languages. Lines connect a model's original and Full Hard runs. The language grid shows individual signed gaps from English and their case counts. It covers all topics and query languages. Query-language comparisons pool the five tasks. Target narrative-language comparisons pool inclusion and exclusion by the target narrative's publication language.

The page also reports the 960-pair Argon Low steering comparison and the 960-pair evidence-position experiment.

## Build and data

The public release is pinned in `release.json`. The response files and Full Hard evaluation are pinned in `runs/manifest.json`. The build checks every file hash, validates the original and expanded evaluation cases, and replays all response scores from their citations and language labels. It retains the published table's standard errors and presents point estimates for follow-up runs. The public export contains questions, instructions, article IDs, answers, scores, and language assessments.

The explorer links to source articles with attribution. The globe uses illustrative topic anchors and public-domain Natural Earth country polygons. The site hosts its fonts, author photographs, affiliation logos, and chart libraries locally.

Use Python 3.12 and Node.js 22 from the repository root.

```bash
npm ci --prefix website --ignore-scripts
python -m pip install -r website/requirements.txt
python -m unittest discover -s website/tests
node --test website/tests/*.test.mjs
python website/build.py
python -m http.server 8000 --bind 127.0.0.1 --directory website/dist
```

Open <http://127.0.0.1:8000/>. Pass `--release /path/to/benchmark` to reuse a local dataset. The build exports Full Hard evaluation cases and both benchmarks' case scores as downloads.

The Pages workflow tests and builds changes on pull requests, then publishes the site when they reach `main`.
