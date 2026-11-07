# Data fields

| Table | Columns |
|---|---|
| `documents` | `document_id`, `topic`, `source_region`, `publication_language`, `narrative_id`, `narrative`, `url`, `publisher`, `text`, `text_en` |
| `queries` | `question_id`, `topic`, `query_type`, and `query_<language code>` for each of the 24 query languages |
| `evaluation` | `case_id`, `question_id`, `topic`, `query_language`, `query_type`, `query`, `task`, `document_ids`, `target_narrative_id`, `expected_document_ids`, `system_instruction`, `query_context`, `prior_answer`, `followup_instruction`, `input_sha256` |
| `responses` | `model_id`, `case_id`, `response`, `response_sha256`, `language_status`, `score` |

`document_ids` identifies the articles supplied in each evaluation case, and `narrative_id` groups articles by source perspective and publication language. `expected_document_ids` identifies articles associated with the narratives required by the task. Use `question_id` to match queries across languages and `case_id` to match responses to their evaluation inputs.

`query_type` distinguishes neutral and confirmatory questions, while `task` identifies Narrative Inclusion (NI), Narrative Exclusion (NE), Missing Narrative Identification (MNI), Baseline Prompt (BP) or Diverse Prompt (DP). MNI includes its fixed `prior_answer` and `followup_instruction`; `query_context` supplies background provided with the question.

`language_status` records whether a response passed the language check (`same`), failed it (`different` or `mixed`), or contained no answer (`no_answer`); `score` ranges from zero to one. `text_en` contains article text in English; empty values in `text_en` or a `query_<language code>` column indicate that the corresponding English text or query translation is unavailable.
