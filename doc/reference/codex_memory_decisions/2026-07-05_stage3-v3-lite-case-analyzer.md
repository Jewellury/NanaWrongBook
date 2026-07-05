# Decision: Stage 3 v3 uses Lite one-shot Case Analyzer

Date: 2026-07-05

## Status

Accepted.

## Context

Stage 3 originally had a v2 dual-pipeline design: call Lite for ASR and Pro for VLM classification, then merge results. A later spike tested a one-shot multimodal path and found that Doubao Lite can process image plus supported audio in one request and return stable structured JSON for the case analyzer use case.

The spike also found that Pro is not the right default for the one-shot path because audio support is not compatible with the required flow. Using Pro in `case-analyzer.ts` would silently drift away from the accepted v3-revised architecture.

## Decision

Stage 3 v3-revised uses a single Lite-based Case Analyzer:

- One API call handles question image and supported audio.
- The output is structured JSON with transcript, question summary, textbook topic candidates, internal knowledge node candidates, light feedback, possible direction, and next action suggestion.
- The model selection must prefer `LITE_ENDPOINT_ID || LITE_MODEL_NAME` and must not fall back to Pro for this path.
- CI tests mock the provider; real provider calls stay out of CI.

## Product Boundary

The v1 product promise is an AI wrong-question card, not a tutoring or diagnosis engine:

- It can show an AI summary, likely textbook chapter, gentle feedback, possible direction, and next action.
- It must not promise complete OCR, full solution steps, answers, deep diagnosis, mastery judgment, or green map lighting.
- `nextActionSuggestion` should be a textbook chapter plus a small check action, not a video link unless a real resource library exists.

## Data Boundary

Student-facing textbook classification and internal system classification remain separate:

- `TextbookTopic` is the user-facing textbook chapter layer.
- `KnowledgeNode` remains the internal map/diagnosis layer.
- `CaseAiResult` persists the latest AI card state.
- `CaseTextbookTopicTag` stores textbook topic evidence.
- `CaseKnowledgeTag` remains internal KnowledgeNode evidence and must not be extended for textbook topics.

## Consequences

- v2 files such as `asr-transcribe.ts` and `vlm-classify.ts` are legacy remnants. They may be referenced while implementing v3, but new Stage 3 code must not import them.
- Cleanup of v2 remnants should be tracked as a `CR` backlog item and performed only after v3 `case-analyzer` and `/process` are stable.
- Round 2 `/process` must preserve user edits and avoid stale VLM evidence on repeated processing.

## Revisit Conditions

Revisit this decision only if a new provider spike shows a better one-shot model with verified support for the actual image plus browser audio formats, stable JSON output, acceptable latency and cost, and no product-boundary regression.
