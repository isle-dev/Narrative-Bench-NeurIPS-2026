# Follow-up evaluations

The Parquet files contain the six Gemini 4 evaluations on NarrativeBench and the three evaluations on NarrativeBench Hard. The manifest records their model configurations, returned response counts, output-limit counts, and file hashes. The website build verifies every response hash and recomputes its score.

`hard-evaluation.parquet` contains all 4,800 expanded cases and a `base_case_id` linking each one to its NarrativeBench case. Its article IDs resolve against the public NarrativeBench documents table at <https://huggingface.co/datasets/jhu-clsp/narrative-bench>.
