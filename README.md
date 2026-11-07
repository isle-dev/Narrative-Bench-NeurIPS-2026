# NarrativeBench

NarrativeBench evaluates the information seeking capabilities models need to navigate diverse narratives across languages. It accompanies *The Narrative Gap: Can LLMs Help Us Navigate Diverse Narratives Across Languages?*

**[Dataset and dataset card](https://huggingface.co/datasets/jhu-clsp/narrative-bench)**

The benchmark contains 1,333 articles across 23 contested topics, 460 Reddit-grounded queries, and 4,800 evaluation cases across 24 query languages. Recorded responses cover 15 model configurations.

## Get started

```bash
python -m pip install -r requirements.txt
hf download jhu-clsp/narrative-bench --repo-type dataset --revision 8a4f5e7d7582fac1f03d2e3cbbedb34280676339 --local-dir benchmark
python code/narrativebench.py validate --root benchmark
python code/narrativebench.py replay --root benchmark --out results.json
```

Replay reproduces all 72,000 recorded response scores. Narrative Inclusion (NI) and Narrative Exclusion (NE) use narrative F1, while Missing Narrative Identification (MNI), Baseline Prompt (BP) and Diverse Prompt (DP) use narrative recall. See [EVALUATION.md](EVALUATION.md) for scoring instructions.

## Evaluate a model

```bash
python code/narrativebench.py export --root benchmark --model qwen35-9b-it --out inputs.jsonl
```

Each exported record contains the messages and generation settings. Run the prepared requests with your model, save its answers, and follow [EVALUATION.md](EVALUATION.md) to identify response language and calculate scores. [DATA.md](DATA.md) describes the dataset fields.

## Citation

Please cite Nikhil Sharma, Kelly Marchisio, Kenton Murray, and Ziang Xiao, *The Narrative Gap: Can LLMs Help Us Navigate Diverse Narratives Across Languages?* (2026).

Dataset annotation and curation metadata use CC BY-NC-SA 4.0; source-article rights remain with their publishers. See [LICENSE_NOTICE.md](LICENSE_NOTICE.md).
