# Follow-up evaluations

The Parquet files contain the six Gemini 4 evaluations on the original benchmark and the three evaluations on NarrativeBench Full Hard. The manifest records their model configurations, returned response counts, output-limit counts, and file hashes. The website build verifies every response hash and recomputes its score.

`hard-evaluation.parquet` contains all 4,800 expanded cases and a `base_case_id` linking each one to the original evaluation. Its article IDs resolve against the public NarrativeBench documents table at <https://huggingface.co/datasets/jhu-clsp/narrative-bench>.

`additional-evaluations.json` gives the paired Argon Low steering and evidence-position results, with question-clustered confidence intervals. Scoring follows the released citation and automatic language rules. Carbon's 271 failed Full Hard requests are absent from its response file, and its reported scores use completed cases.
