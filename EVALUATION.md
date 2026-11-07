# Evaluating models

## Prepare inputs

```bash
python code/narrativebench.py export --root benchmark --model qwen35-9b-it --out inputs.jsonl
```

Choose a configuration from `benchmark/models.json`. Each exported record contains the messages and generation settings for the model. Generate the answers and save one JSON object per line:

```json
{"case_id":"case identifier from the input","model_id":"your model identifier","response":"returned answer"}
```

Missing Narrative Identification (MNI) includes the fixed prior answer and follow-up; add `--limit 5` to export a small trial.

## Set up language detection

```bash
python -m pip install -r code/requirements-language.txt huggingface_hub
```

Language detection uses Lingua, with fastText for Amharic, Tigrinya, Nepali and Dari. Download the fastText weights once using the settings in `code/language_detector.json`:

```python
import json
from huggingface_hub import hf_hub_download

config = json.load(open("code/language_detector.json"))
model_path = hf_hub_download(
    repo_id=config["model"], filename=config["filename"], revision=config["revision"]
)
print(model_path)
```

## Score responses automatically

Use the downloaded model path in the scoring command:

```bash
python code/narrativebench.py score --root benchmark --predictions predictions.jsonl \
  --fallback-model /path/to/model.bin --out scores.jsonl
```

Scoring uses Lingua and fastText for language detection and citations for narrative coverage. Low-confidence detections pass the language check; responses identified as outside the query language receive a score of 0.

Narrative Inclusion (NI) and Narrative Exclusion (NE) use narrative F1, while MNI, Baseline Prompt (BP) and Diverse Prompt (DP) use narrative recall. Results include a score for every response and a summary by model and task. The command also saves the language outcomes in `scores.languages.jsonl`.

## Reproduce the recorded scores

```bash
python code/narrativebench.py replay --root benchmark --out results.json
```

Replay reproduces all 72,000 recorded scores from the released answers and language labels.
