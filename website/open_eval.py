"""Prepare an Open Eval submission from the released evaluation cases and saved responses."""
import argparse
from collections import Counter, defaultdict
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import zipfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'code'))
from narrativebench import messages, parquet_rows, score, text_sha, validate_case

PAPER = 'https://arxiv.org/abs/2611.12750'
DATASET = 'https://huggingface.co/datasets/jhu-clsp/narrative-bench'
CODE = 'https://github.com/isle-dev/Narrative-Bench-NeurIPS-2026'
CONTRIBUTOR = {'name': 'Nikhil Sharma', 'email': 'nsharm27@jhu.edu', 'affiliation': 'Johns Hopkins University'}
TASKS = ('NI', 'NE', 'MNI', 'BP', 'DP')


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def response_entry(case, documents, row, configuration):
    value = row['score']
    if not isinstance(value, (int, float)) or not 0 <= value <= 1:
        raise ValueError('Scores must be finite values between zero and one')
    if text_sha(row['response']) != row['response_sha256']:
        raise ValueError('Response text does not match its checksum')
    if abs(score(case, row['response'], row['language_status'], documents) - value) > 1e-12:
        raise ValueError('Response score does not replay')
    generation = configuration['generation']
    temperature = generation.get('temperature')
    parameters = {'temperature': temperature,
                  'do_sample': None if temperature is None else temperature > 0,
                  'top_k': generation.get('top_k'), 'top_p': generation.get('top_p'),
                  'max_tokens': generation['max_output_tokens']}
    for key in ('thinking_level', 'thinking_budget', 'reasoning_effort'):
        if key in generation:
            parameters[key] = generation[key]
    if configuration.get('chat_template_kwargs'):
        parameters['chat_template_kwargs'] = configuration['chat_template_kwargs']
    if 'stop_token_ids' in generation:
        parameters['stop_token_ids'] = generation['stop_token_ids']
    if configuration.get('revision'):
        parameters['model_revision'] = configuration['revision']
    configuration_id = row['model_id']
    return {
        'model': {'name': configuration['api_model'], 'model_adaptation': {
            'system_instruction': case['system_instruction'],
            'generation_parameters': parameters, 'tools': []}},
        'item_adaptation': {'request_input': messages(case, documents)[1:],
                            'external_resources': []},
        'response_content': [row['response']],
        'scores': [{'metric': {
            'name': 'narrative_f1' if case['task'] in {'NI', 'NE'} else 'narrative_recall',
            'models': ['citation-based narrative scorer', 'automatic response-language check'],
            'extra_artifacts': [{'type': 'scoring_context', 'content': {
                'configuration_id': configuration_id, 'language_status': row['language_status'],
                'scoring_code': CODE + '/blob/main/code/narrativebench.py'}}]}, 'value': value}],
    }


def item_entry(case, documents, responses, configurations, benchmark, version):
    validate_case(case, documents)
    refs = {'expected_document_ids': case['expected_document_ids'],
            'expected_narrative_ids': sorted({documents[d]['narrative_id'] for d in case['expected_document_ids']}),
            'document_narratives': {d: documents[d]['narrative_id'] for d in case['document_ids']}}
    if case.get('target_narrative_id'):
        refs['target_narrative_id'] = case['target_narrative_id']
    content = {key: case[key] for key in ('case_id', 'question_id', 'topic', 'query_language', 'query_type', 'query', 'task', 'document_ids')}
    if case.get('base_case_id'):
        content['base_case_id'] = case['base_case_id']
    return {
        'item_metadata': {'contributor': CONTRIBUTOR, 'source': {
            'benchmark_name': benchmark, 'benchmark_version': version, 'paper_url': PAPER,
            'dataset_url': DATASET if benchmark == 'NarrativeBench' else CODE + '/blob/main/website/runs/hard-evaluation.parquet',
            'benchmark_tags': ['multilingual', 'information seeking', 'narrative navigation'],
            'benchmark_license': 'CC-BY-NC-SA-4.0'}},
        'item_content': {'input': [content], 'references': [refs]},
        'responses': [response_entry(case, documents, row, configurations[row['model_id']])
                      for row in sorted(responses, key=lambda r: r['model_id'])],
    }


def read_responses(paths):
    rows = defaultdict(list)
    seen = set()
    for path in paths:
        for row in parquet_rows(path):
            key = (row['case_id'], row['model_id'])
            if key in seen:
                raise ValueError('Duplicate model response for a case')
            seen.add(key)
            rows[row['case_id']].append(row)
    return rows


def prepare(release, output, validator_dir):
    from build import LOCK, verify_input
    for name, expected in LOCK['sha256'].items():
        verify_input(release / name, expected)
    manifest = json.loads((HERE / 'runs/manifest.json').read_text())
    for entry in [manifest['hard_evaluation'], *manifest['runs']]:
        verify_input(HERE / 'runs' / entry['file'], entry['sha256'])
    output.mkdir(parents=True, exist_ok=False)
    sys.path.insert(0, str(validator_dir))
    spec = importlib.util.spec_from_file_location('openeval_official_validator', validator_dir / 'validator.py')
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    documents = {r['document_id']: r for r in parquet_rows(release / 'data/documents.parquet')}
    configurations = json.loads((release / 'models.json').read_text())
    for run in manifest['runs']:
        model = run['model_id']
        if model in configurations:
            continue
        api_model, level = model.rsplit('-', 1)
        configurations[model] = {'api_model': api_model, 'generation': {
            'max_output_tokens': 65536 if level == 'xhigh' else 32768,
            'thinking_level': level.upper()}}
    report = {'schema_url': 'https://github.com/open-eval/OpenEval/blob/master/item_schema.json',
              'schema_sha256': digest(validator_dir / 'item_schema.json'),
              'validator_sha256': digest(validator_dir / 'validator.py'),
              'files': {}, 'items': 0, 'responses': 0, 'validation_errors': 0}
    commit_file = validator_dir / 'commit.json'
    if commit_file.exists():
        report['openeval_commit'] = json.loads(commit_file.read_text())['sha']
    archive = output / 'NarrativeBench-OpenEval.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True) as bundle:
        for dataset, label in [('original', 'NarrativeBench'), ('hard', 'NarrativeBench Hard')]:
            case_path = release / 'data/evaluation.parquet' if dataset == 'original' else HERE / 'runs/hard-evaluation.parquet'
            cases = list(parquet_rows(case_path))
            paths = [HERE / 'runs' / run['file'] for run in manifest['runs'] if run['dataset'] == dataset]
            if dataset == 'original':
                paths.insert(0, release / 'data/responses.parquet')
            rows = read_responses(paths)
            if set(rows) != {c['case_id'] for c in cases}:
                raise ValueError('Responses do not cover the expected cases')
            version = LOCK['revision'] if dataset == 'original' else manifest['hard_evaluation']['sha256']
            for task in TASKS:
                filename = f'submissions/narrativebench{ "-hard" if dataset == "hard" else ""}/{task}.jsonl'
                stats = {'items': 0, 'responses': 0, 'sha256': '', 'configurations': {}, 'task_score_means': {}}
                checksum = hashlib.sha256()
                counts, totals = Counter(), Counter()
                with bundle.open(filename, 'w', force_zip64=True) as stream:
                    for case in cases:
                        if case['task'] != task:
                            continue
                        item = item_entry(case, documents, rows[case['case_id']], configurations, label, version)
                        valid, violations = validator.validate_entry(item)
                        if not valid:
                            raise ValueError(f'{case["case_id"]}: {violations}')
                        line = (json.dumps(item, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode('utf-8')
                        stream.write(line)
                        checksum.update(line)
                        stats['items'] += 1
                        stats['responses'] += len(item['responses'])
                        for row in rows[case['case_id']]:
                            counts[row['model_id']] += 1
                            totals[row['model_id']] += row['score']
                stats['sha256'] = checksum.hexdigest()
                stats['configurations'] = dict(counts)
                stats['task_score_means'] = {m: totals[m] / n for m, n in counts.items()}
                report['files'][filename] = stats
                report['items'] += stats['items']
                report['responses'] += stats['responses']
                print(f'{filename}: {stats["items"]} items, {stats["responses"]} validated responses', flush=True)
            del rows
    # Read the finished archive to verify serialized records and file integrity.
    for_verified = 0
    with zipfile.ZipFile(archive) as bundle:
        for filename, expected in report['files'].items():
            checksum = hashlib.sha256()
            with bundle.open(filename) as stream:
                for line in stream:
                    checksum.update(line)
                    valid, violations = validator.validate_entry(json.loads(line))
                    if not valid:
                        raise ValueError(f'Serialized entry failed validation: {violations}')
                    for_verified += 1
            if checksum.hexdigest() != expected['sha256']:
                raise ValueError('Archive checksum mismatch')
    if for_verified != report['items']:
        raise ValueError('Archive item count mismatch')
    report['archive_sha256'] = digest(archive)
    (output / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
    (output / 'README.md').write_text('''# NarrativeBench item-level results

Extract `NarrativeBench-OpenEval.zip` and upload the `submissions/` directory to a new pull request in https://huggingface.co/datasets/Open-Eval-Commons/OpenEval.

The ten JSONL files contain 4,800 NarrativeBench items with 100,800 responses across 21 model configurations and 4,800 NarrativeBench Hard items with 14,129 responses across three configurations. Files are grouped by dataset and task. Every response includes its actual input messages, model settings, answer, and score. Article texts appear in the prompts, with their original attribution and URLs.

NI and NE use narrative F1. MNI, BP, and DP use narrative recall. Scores range from 0 to 1 and include the automatic response-language check. Framing and language gaps are aggregate comparisons calculated from the item scores. Carbon Hard contains its 4,529 completed responses.

Unspecified generation settings are null. Reasoning settings are retained when specified. `validation.json` records the official schema and validator checksums, item counts, per-model task means, and archive checksum. Both datasets are distributed under CC BY-NC-SA 4.0, with source article rights retained by their publishers.

Paper: https://arxiv.org/abs/2611.12750
Dataset: https://huggingface.co/datasets/jhu-clsp/narrative-bench
Code: https://github.com/isle-dev/Narrative-Bench-NeurIPS-2026
''')
    print(json.dumps({k: report[k] for k in ('items', 'responses', 'validation_errors', 'archive_sha256')}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--validator', required=True, type=Path)
    args = parser.parse_args()
    prepare(args.release, args.output, args.validator)
