"""Create the GitHub Pages artifact from the pinned public NarrativeBench release."""
import argparse
import ipaddress
import json
import re
import shutil
import sys
import tempfile
import time
from collections import Counter, defaultdict
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "code"))
from narrativebench import (  # noqa: E402
    LANGUAGE_STATUSES, file_sha, parquet_rows, score, summarize, text_sha, validate_case,
)

LOCK = json.loads((HERE / "release.json").read_text(encoding="utf-8"))


def verify_input(path, digest):
    if not path.is_file() or file_sha(path) != digest:
        raise ValueError(f"Release input does not match its pinned SHA-256: {path.name}")


def download_release(folder):
    base_url = f"https://huggingface.co/datasets/{LOCK['repo']}/resolve/{LOCK['revision']}"
    for name, digest in LOCK["sha256"].items():
        path = folder / name
        path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(3):
            try:
                with urlopen(f"{base_url}/{name}", timeout=60) as remote, path.open("wb") as local:
                    shutil.copyfileobj(remote, local)
                break
            except (URLError, TimeoutError, ConnectionError):
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        verify_input(path, digest)


def index_rows(rows, key):
    index = {}
    for row in rows:
        value = row[key]
        if value in index:
            raise ValueError(f"Duplicate {key}: {value}")
        index[value] = row
    return index


def file_id(value):
    if not re.fullmatch(r"[a-zA-Z0-9-]+", value):
        raise ValueError(f"Invalid identifier: {value}")
    return value


def article_url(value):
    if not isinstance(value, str) or re.search(r"[\s\\\x00-\x1f\x7f]", value):
        return None
    try:
        url = urlsplit(value)
        host = url.hostname
        if url.scheme not in {"http", "https"} or not host or url.username is not None or url.port not in {None, 80, 443}:
            return None
        if "." not in host or host.rstrip(".").endswith((".local", ".localhost", ".internal")):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            if "%" in host or re.fullmatch(r"(?:[0-9]+|0x[0-9a-f]+)", host.rstrip(".").split(".")[-1]):
                return None
    except ValueError:
        return None
    return value


def project(lon, lat):
    return [round((lon + 180) / 360 * 1000, 2), round((84 - lat) / 144 * 400, 2)]


def topic_regions(topic):
    regions = topic.get("regions")
    if regions is None:
        return []
    if len(regions) < 2:
        raise ValueError("Linked regions require at least two locations")
    entries = []
    for label, lon, lat in regions:
        if not label or not -180 <= lon <= 180 or not -90 <= lat <= 90:
            raise ValueError("Invalid linked regions")
        entries.append({"label": label, "location": [lon, lat]})
    if len({item["label"] for item in entries}) != len(entries) or len({tuple(item["location"]) for item in entries}) != len(entries):
        raise ValueError("Linked regions must be distinct")
    return entries


def validate_paper_results(paper, models, diagnostics):
    rows = index_rows(paper["rows"], "id")
    columns = paper["columns"]
    if set(rows) != {model["id"] for model in models} or len(columns) != 11:
        raise ValueError("Paper table must cover the benchmark models and all 11 metrics")
    for model in models:
        cells = rows[model["id"]]["cells"]
        if len(cells) != len(columns):
            raise ValueError(f"Incomplete paper results for {model['id']}")
        for column, cell in zip(columns, cells):
            if not 0 <= cell["bin"] < len(paper["palette"]):
                raise ValueError(f"Invalid paper color bin for {model['id']}")
            task = column["task"]
            if task:
                actual = f"{int(model['scores'][task] * 1000 + 0.5) / 10:.1f}"
            else:
                value = diagnostics[model["id"]][column["diagnostic"]]
                actual = f"{value:.{column['decimals']}f}"
            if cell["display"].split()[0] != actual:
                raise ValueError(f"Paper score does not match the pinned release: {model['id']} {column['label']}")


def write_json(path, data):
    with path.open("w", encoding="utf-8") as stream:
        json.dump(data, stream, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        stream.write("\n")


def copy_browser_libraries(site):
    libraries = {
        "d3-array": ("dist/d3-array.min.js", "d3-array.js"),
        "d3-geo": ("dist/d3-geo.min.js", "d3-geo.js"),
        "plotly.js-basic-dist-min": ("plotly-basic.min.js", "plotly.js"),
        "marked": ("lib/marked.esm.js", "marked.mjs"),
        "dompurify": ("dist/purify.es.mjs", "dompurify.mjs"),
    }
    vendor = site / "vendor"
    vendor.mkdir()
    for package, (source, filename) in libraries.items():
        root = HERE / "node_modules" / package
        if not (root / source).is_file():
            raise FileNotFoundError("Run npm ci --prefix website --ignore-scripts before building")
        shutil.copyfile(root / source, vendor / filename)
        shutil.copyfile(root / "LICENSE", vendor / f"{package}-LICENSE.txt")
    shutil.copyfile(HERE / "node_modules/internmap/LICENSE", vendor / "internmap-LICENSE.txt")


def version_browser_assets(site):
    """Keep entry points, module imports, and their fetched data on the same release."""
    modules = sorted(site.glob("*.mjs"))
    assets = [
        *modules, site / "styles.css",
        *sorted((site / "vendor").glob("*.js")), *sorted((site / "vendor").glob("*.mjs")),
        *sorted((site / "data").glob("*.json")),
    ]
    version = text_sha("".join(file_sha(path) for path in assets))[:16]
    reference = re.compile(r"""(?P<quote>['"])(?P<path>\./(?:vendor/)?[\w.-]+\.(?:m?js|css))(?P=quote)""")
    for path in [site / "index.html", *modules]:
        original = path.read_text(encoding="utf-8")
        updated = reference.sub(rf"\g<quote>\g<path>?v={version}\g<quote>", original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
    return version


def source_omission(context, answer):
    """Count source languages with no valid in-context citation, regardless of answer language."""
    cited = set(re.findall(r"\bD\d{4}\b", answer or ""))
    available = set(context.values())
    covered = {context[doc_id] for doc_id in cited & context.keys()}
    return len(available - covered), len(available)


def ranking_slice(rows, cases, documents):
    summary = summarize(rows, cases, documents)["models"]
    omitted, opportunities = Counter(), Counter()
    for row in rows:
        if row["task"] in {"BP", "DP"}:
            key = row["model_id"], row["task"]
            omitted[key] += row["source_omissions"]
            opportunities[key] += row["source_opportunities"]

    counts, scores, diagnostics = {}, {}, {}
    for model, result in summary.items():
        tasks = result["tasks"]
        model_counts = {task: stats["cases"] for task, stats in tasks.items()}
        if counts and counts != model_counts:
            raise ValueError("Inconsistent model denominators in ranking slice")
        counts = model_counts
        scores[model] = {task: stats["mean"] for task, stats in tasks.items()}
        metrics = result["higher_capabilities"]
        diagnostics[model] = {
            key: metrics[key] for key in
            ("confirmatory_absolute_gap_pp", "query_language_gap_pp", "target_language_gap_pp")
        }
        diagnostics[model]["language_violations"] = result["language_violations"]
        for task in ("BP", "DP"):
            key = model, task
            diagnostics[model][f"{task.lower()}_omission_pct"] = (
                100 * omitted[key] / opportunities[key] if opportunities[key] else None
            )
    return {"counts": counts, "scores": scores, "diagnostics": diagnostics}


def pooled_score(slice_, model):
    counts = slice_["counts"]
    return sum(count * slice_["scores"][model][task] for task, count in counts.items()) / sum(counts.values())


def ranking_slices(rows, cases, documents):
    groups = defaultdict(lambda: defaultdict(list))
    for row in rows:
        topic, language = row["topic"], row["query_language"]
        groups[topic][language].append(row)
        groups[topic]["all"].append(row)
        groups["all"][language].append(row)
        groups["all"]["all"].append(row)

    slices = {}
    for topic, languages in groups.items():
        by_language = {language: ranking_slice(members, cases, documents) for language, members in languages.items()}
        english = by_language.get("en")
        if english:
            # For a single non-English query language, retain the English baseline for the same topic scope.
            for language, slice_ in by_language.items():
                if language in {"all", "en"}:
                    continue
                for model, metrics in slice_["diagnostics"].items():
                    metrics["query_language_gap_pp"] = 100 * abs(pooled_score(slice_, model) - pooled_score(english, model))
        slices[topic] = by_language
    return slices


def map_query_index(topic_queries):
    index = {}
    for topic_id, rows in topic_queries.items():
        entries = []
        for query in rows:
            texts = query["translations"]
            available = sorted(lang for lang, text in texts.items() if text)
            if not available:
                continue
            evaluated = sorted(lang for lang in available if any(query["cases"].get(lang, {}).values()))
            preview = "en" if "en" in available else (evaluated or available)[0]
            entries.append({
                "id": query["id"], "text": texts[preview], "textLang": preview,
                "languages": evaluated, "available": available,
            })
        index[topic_id] = entries
    return index


def build_site(release, output):
    for name, digest in LOCK["sha256"].items():
        verify_input(release / name, digest)
    languages = json.loads((release / "languages.json").read_text(encoding="utf-8"))
    configurations = json.loads((release / "models.json").read_text(encoding="utf-8"))
    models = json.loads((HERE / "models.json").read_text(encoding="utf-8"))
    topics = json.loads((HERE / "topics.json").read_text(encoding="utf-8"))
    documents = index_rows(parquet_rows(release / "data/documents.parquet"), "document_id")
    cases = index_rows(parquet_rows(release / "data/evaluation.parquet"), "case_id")
    queries = index_rows(parquet_rows(release / "data/queries.parquet"), "question_id")
    if set(configurations) != set(models) or {q["topic"] for q in queries.values()} != set(topics):
        raise ValueError("Display metadata must cover the full release")
    if len({topic["id"] for topic in topics.values()}) != len(topics):
        raise ValueError("Duplicate topic identifier")

    queries_by_topic = defaultdict(list)
    query_view = {}
    for qid, row in queries.items():
        item = {
            "id": qid,
            "type": row["query_type"],
            "translations": {lang: row[f"query_{lang}"] for lang in languages if row[f"query_{lang}"]},
            "cases": {},
        }
        query_view[qid] = item
        queries_by_topic[row["topic"]].append(item)

    source_languages = {}
    for case_id, case in cases.items():
        validate_case(case, documents)
        if case["task"] in {"BP", "DP"}:
            source_languages[case_id] = {doc_id: documents[doc_id]["publication_language"] for doc_id in case["document_ids"]}
        query = query_view[case["question_id"]]
        lang = case["query_language"]
        task = case["task"]
        if (case["topic"] != queries[case["question_id"]]["topic"]
                or case["query_type"] != query["type"] or lang not in query["translations"]):
            raise ValueError(f"Evaluation case does not match its query: {case_id}")
        tasks = query["cases"].setdefault(lang, {})
        if task in tasks:
            raise ValueError(f"Duplicate query, language and task: {case_id}")
        tasks[task] = file_id(case_id)

    responses = defaultdict(dict)
    summary_rows = []
    for row in parquet_rows(release / "data/responses.parquet"):
        case_id, model = row["case_id"], row["model_id"]
        case = cases[case_id]
        if model not in models or model in responses[case_id]:
            raise ValueError(f"Unknown or duplicate model response: {case_id} {model}")
        language = row["language_status"]
        answer = row["response"]
        if language not in LANGUAGE_STATUSES or text_sha(answer) != row["response_sha256"]:
            raise ValueError(f"Invalid response: {case_id} {model}")
        value = row["score"]
        if not 0 <= value <= 1:
            raise ValueError(f"Invalid score: {case_id} {model}")
        if abs(score(case, answer, language, documents) - value) > 1e-12:
            raise ValueError(f"Recorded score does not replay: {case_id} {model}")
        responses[case_id][model] = {"text": answer, "language": language, "score": value}
        omitted, opportunities = source_omission(source_languages[case_id], answer) if case_id in source_languages else (0, 0)
        summary_rows.append({
            "case_id": case_id, "model_id": model, "task": case["task"], "score": value, "language_status": language,
            "source_omissions": omitted, "source_opportunities": opportunities,
            "topic": topics[case["topic"]]["id"], "query_language": case["query_language"],
        })

    if any(set(responses[case_id]) != set(models) for case_id in cases):
        raise ValueError("Each evaluation case must have all model configurations")

    rankings = ranking_slices(summary_rows, cases, documents)
    aggregate = rankings["all"].pop("all")
    counts = aggregate["counts"]
    models_view = [
        {"id": model, "name": name, "scores": aggregate["scores"][model]} for model, name in models.items()
    ]

    paper = json.loads((HERE / "paper-results.json").read_text(encoding="utf-8"))
    validate_paper_results(paper, models_view, aggregate["diagnostics"])

    with tempfile.TemporaryDirectory(dir=output.parent) as stage:
        site = Path(stage) / "site"
        shutil.copytree(HERE / "src", site)
        copy_browser_libraries(site)
        data = site / "data"
        (data / "topics").mkdir(parents=True)
        (data / "cases").mkdir()
        catalog_topics = []
        topic_queries = {}
        for key, topic in topics.items():
            topic_id = file_id(topic["id"])
            entries = queries_by_topic[key]
            point = project(*topic["anchor"]) if topic["anchor"] else None
            entry = {"id": topic_id, "label": topic["label"], "point": point, "count": len(entries)}
            if "pinLabel" in topic:
                entry["pinLabel"] = topic["pinLabel"]
            regions = topic_regions(topic)
            if regions:
                entry["regions"] = regions
            catalog_topics.append(entry)
            write_json(data / "topics" / f"{topic_id}.json", entries)
            topic_queries[topic_id] = entries
        write_json(data / "map-queries.json", map_query_index(topic_queries))
        for case_id, case in cases.items():
            write_json(data / "cases" / f"{case_id}.json", {
                "id": case_id,
                "query": case["query"],
                "instruction": case["system_instruction"],
                "context": case["query_context"],
                "priorAnswer": case["prior_answer"],
                "followup": case["followup_instruction"],
                "sources": case["document_ids"],
                "responses": responses[case_id],
            })

        countries = json.loads((HERE / "geo" / "countries.json").read_text(encoding="utf-8"))
        write_json(data / "map.json", [
            [[[project(*point) for point in ring] for ring in polygon] for polygon in country]
            for country in countries
        ])
        write_json(data / "sources.json", {
            doc_id: {
                "url": article_url(row["url"]), "publisher": row["publisher"],
                "region": row["source_region"], "language": row["publication_language"],
            }
            for doc_id, row in documents.items()
        })
        write_json(data / "rankings.json", rankings)
        write_json(data / "paper-results.json", paper)
        write_json(data / "catalog.json", {
            "topics": catalog_topics, "languages": languages, "models": models_view,
            "counts": {"queries": len(queries), "cases": len(cases), "responses": len(summary_rows), "tasks": counts},
            "revision": LOCK["revision"],
        })
        version_browser_assets(site)
        (site / ".nojekyll").touch()
        site.rename(output)
    print(f"Built {len(topics)} topics, {len(queries)} queries, {len(cases)} cases and {len(summary_rows)} verified responses.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", type=Path, help="Local directory containing the pinned release. Downloads it if omitted.")
    parser.add_argument("--output", type=Path, default=HERE / "dist")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        parser.error(f"Output already exists: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.release:
        build_site(args.release, output)
    else:
        with tempfile.TemporaryDirectory() as folder:
            release = Path(folder)
            download_release(release)
            build_site(release, output)


if __name__ == "__main__":
    main()
