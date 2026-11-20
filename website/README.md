# NarrativeBench Explorer

The website compares the published NarrativeBench evaluations with six Gemini 4 configurations and three NarrativeBench Hard configurations. Readers can filter the tables and rankings by topic and query language, inspect recorded answers, compare source-language omissions, and explore language disparities in Plotly.

## Evaluations

NarrativeBench contains 4,800 evaluation cases across 460 questions, 23 topics, and 24 query languages. Its leaderboard includes the 15 published configurations and the six Gemini 4 follow-up runs.

NarrativeBench Hard supplies every released article for each topic. Contexts grow from 24 to 59 articles on average and reach 238 articles, while preserving the questions, tasks, and labeled narratives. Hydrogen XHigh and Argon Low have 4,800 responses each. Carbon High completed 4,529 cases. Tables and tooltips use the completed case counts for each model and task.

The language-disparity view plots the mean absolute score gap from English for query languages against the corresponding gap for target narrative languages. Lines connect the same model on NarrativeBench and NarrativeBench Hard. The language grid shows individual signed gaps from English and their case counts. It covers all topics and query languages. Query-language comparisons pool the five tasks. Target narrative-language comparisons pool inclusion and exclusion by the target narrative's publication language.

## Build and data

The public release is pinned in `release.json`. The response files and NarrativeBench Hard evaluation are pinned in `runs/manifest.json`. The build checks every file hash, validates both benchmarks, and replays all response scores from their citations and language labels. It retains the published table's standard errors and presents point estimates for follow-up runs. The public export contains questions, instructions, article IDs, answers, scores, and language assessments.

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

Open <http://127.0.0.1:8000/>. Pass `--release /path/to/benchmark` to reuse a local dataset. The build exports NarrativeBench Hard evaluation cases and both benchmarks' case scores as downloads.

The Pages workflow tests and builds changes on pull requests, then publishes the site when they reach `main`.


## Compare NarrativeBench and Hard

The results table displays the NarrativeBench configurations first and the three NarrativeBench Hard configurations below a divider, with a shared color scale. Sorting works within each dataset. Topic and query-language filters apply to both datasets. Language-disparity plots compare both evaluations, and individual Hard runs are also available in the source-language selector.

## Open Eval export

`open_eval.py` prepares a ZIP containing ten JSONL files under `submissions/`, grouped by dataset and task. It replays every response score, validates each item with the official Open Eval validator, and reads the completed archive back for validation. Use the official schema and validator from https://github.com/open-eval/OpenEval and install their `jsonlines` dependency before running.

```bash
python website/open_eval.py --release /path/to/benchmark --validator /path/to/OpenEval --output /path/to/new-submission-folder
```

The output contains the submission ZIP, a short upload guide, and `validation.json` with counts, task means, and checksums. Preparing the export does not submit it.
