# Backend LLM Assessment

Date: 2026-03-06

Scope:
- No code changes were made.
- This is a backend-only assessment of how `apps/backend` handles LLM requests today.

## Executive Summary

The backend is small and understandable, but the LLM workflow is expensive, synchronous, and retry-heavy.

The main risk is not a single obvious syntax bug. The bigger issue is the combination of:

- long request timeouts
- immediate retries
- multiple LLM calls inside one user action
- no Router-level fallback / cooldown / routing policy
- limited schema validation on some LLM-returned payloads

Under light usage this can feel fine. Under many concurrent users, it can become slow, bursty, and fragile.

## Core Architecture

The LLM wrapper lives in `apps/backend/app/llm.py`.

The app does not use `pydantic-ai`.

Current stack:
- FastAPI
- Pydantic v2
- LiteLLM
- TinyDB

Structured output pattern:
- prompt for JSON
- call `litellm.acompletion(...)`
- optionally pass `response_format={"type":"json_object"}`
- manually extract JSON from the model text
- `json.loads(...)`
- sometimes validate with Pydantic

## Main Entry Points

### 1. Resume upload / parse

Path:
- upload file
- convert file to markdown
- call LLM once to parse markdown into resume JSON
- validate with `ResumeData`
- save to DB

Files:
- `apps/backend/app/routers/resumes.py`
- `apps/backend/app/services/parser.py`

Operational note:
- one upload can still spend a long time inside JSON retries before returning

### 2. Resume improve preview

Path:
- fetch resume + job
- maybe extract job keywords
- improve resume
- preserve original personal info
- optionally run refinement
  - keyword injection via LLM
  - AI phrase cleanup locally
  - alignment validation locally
- compute preview hash
- return preview

This is one of the most expensive request paths.

Worst-case logical LLM calls for one preview:
- 1 keyword extraction
- 1 improve call
- 1 keyword injection refinement call

Each JSON call can retry up to 3 total attempts.

### 3. Resume improve confirm

Path:
- validate improved payload against original personal info
- validate preview hash
- generate title
- optionally generate cover letter
- optionally generate outreach message
- persist tailored resume

This route is cheaper than preview in JSON terms, but it still fans out into multiple text-generation calls.

### 4. One-step improve

Path:
- extract keywords
- improve resume
- maybe refine with keyword injection
- generate title
- maybe generate cover letter and outreach
- persist result

This is the heaviest single endpoint in the backend.

Worst case:
- 3 JSON logical operations
- 3 text logical operations

### 5. Enrichment flows

Analyze:
- one JSON call

Enhance:
- re-analyzes the whole resume
- then makes one JSON call per enriched item

Regenerate:
- one JSON call per selected item
- all items processed in parallel

This area has the highest fan-out behavior relative to user input size.

## Retry Behavior

Retries are implemented in application code, not via LiteLLM Router.

Current behavior in `complete_json(...)`:
- default `retries=2`
- total attempts = 3
- retries all exception types the same way
- no backoff
- no jitter
- no cooldown
- no error-type policy

On parse failure, retry prompt is modified.
On truncation suspicion, retry prompt is modified.

This helps recover malformed JSON, but it has scaling costs:

- 429s get retried immediately
- 500s get retried immediately
- upstream provider instability can create burst amplification
- retries happen on the same request thread lifecycle

## Timeout Behavior

Base timeouts:
- health: 30s
- completion: 120s
- json: 180s

Timeouts scale with:
- `max_tokens`
- provider factor

Examples:
- JSON with `8192` tokens on OpenAI -> 360s
- JSON with `8192` tokens on OpenRouter -> 540s

Because retries can happen 3 times, one logical JSON step can remain active for a very long time.

That makes slow failure one of the biggest user-impact risks.

## Structured Output Dependence

The backend depends heavily on structured outputs.

Critical JSON-dependent flows:
- parse resume
- extract job keywords
- improve resume
- inject keywords
- enrichment analyze
- enrichment enhance
- enrichment regenerate

This means model reliability should be judged by JSON quality first, not just general answer quality.

## Validation Quality

Strong validation exists in some places:
- parsed resumes validate with `ResumeData`
- improved resumes validate with `ResumeData`

Weaker validation exists in others:
- keyword extraction returns raw dict
- enrichment analysis builds typed objects from raw dict access
- enhancement results are only partially normalized
- regenerate results trust returned keys like `new_bullets` / `new_skills`

So some high-value workflows have strong schema enforcement, but several auxiliary workflows do not.

## Config and Provider State

There are two config paths:

1. top-level LLM config:
- `provider`
- `model`
- `api_key`
- `api_base`

2. provider key map:
- `api_keys`

Actual LLM calls use the top-level config path.

The provider-key map exists in config endpoints, but the main runtime wrapper does not consume it in the request path.

This creates a mismatch risk:
- UI can say keys are configured
- runtime calls can still fail if the top-level `api_key` is empty

That is a correctness and supportability problem.

## OpenRouter / Model Construction Risk

The most suspicious implementation detail is in `apps/backend/app/llm.py`.

The wrapper does custom provider/model normalization with `get_model_name(...)`.

It also hardcodes an OpenRouter allowlist for JSON-capable models.

That is risky because:
- capability can go stale
- new models require code updates
- the check is sensitive to model string format

Example risk:
- `anthropic/claude-3.5-sonnet`
- `openrouter/anthropic/claude-3.5-sonnet`

Those can be treated differently by the current JSON-support check.

This is likely part of what the LiteLLM engineer was reacting to.

## Health Check Cost

`/health`, `/status`, `/config/llm-test`, and the post-save background health check all make real LLM calls.

That means health is not cheap infrastructure health. It is live provider health.

This is acceptable for local or low-volume use, but for heavier usage it means:
- status checks can cost tokens
- status checks depend on provider latency
- status checks can contribute to provider load

The frontend does cache status reasonably, but the backend health design is still expensive by nature.

## Concurrency / Fan-Out Risk

There is no global concurrency limiter for LLM calls.

There is no queue.

There is no request budget.

There is no semaphore around high-cost operations.

As a result:
- a burst of preview or improve requests can create many simultaneous upstream calls
- enrichment regenerate can create one LLM request per item in parallel
- text generation after improve adds more parallel calls

This is likely to become visible as latency spikes, timeouts, and inconsistent reliability before it becomes a pure crash problem.

## User-Impact Risk Ranking

### High risk

1. Timeout and retry amplification
- long waits
- duplicate upstream pressure
- poor behavior under provider degradation

2. Missing Router-level fallback / retry policy
- no model failover
- no cooldown
- no error-type handling

3. OpenRouter custom capability logic
- capability mismatches
- JSON mode inconsistencies

### Medium risk

4. Config mismatch between top-level key and provider key map
- “configured” state can diverge from runtime reality

5. Enrichment enhance re-analysis
- adds cost
- adds nondeterminism

6. Weak schema validation in some non-core JSON workflows
- malformed but syntactically valid payloads can leak further downstream

### Lower risk

7. Health checks being live model calls
- more of a cost / operations concern than a logic bug

## What Is Good In The Current Implementation

There are good decisions here too:

- API key is passed directly into LiteLLM calls instead of mutating global env
- there is real Pydantic validation on major resume structures
- personal info is preserved from original resume before confirm/persist
- preview hash validation prevents arbitrary confirm payloads
- prompt injection sanitization exists for job descriptions
- alignment cleanup removes clearly fabricated skills / certs / companies

So this is not a sloppy backend. It is a backend that now needs reliability controls more than basic correctness cleanup.

## Practical Conclusion

If the concern is “what could hurt us when many users hit this backend?”, the main answer is:

the LLM workflow is currently too synchronous and too eager to retry, while also doing too much work per request.

The path that needs the most scrutiny is:

- `apps/backend/app/llm.py`
- then `apps/backend/app/routers/resumes.py`
- then `apps/backend/app/routers/enrichment.py`

If the concern is “what specific implementation detail looks suspicious?”, the strongest candidates are:

- hardcoded OpenRouter JSON model logic
- app-level retries instead of Router-level reliability features
- config split between `api_key` and `api_keys`

## Files To Review First

- `apps/backend/app/llm.py`
- `apps/backend/app/routers/resumes.py`
- `apps/backend/app/routers/enrichment.py`
- `apps/backend/app/services/parser.py`
- `apps/backend/app/services/improver.py`
- `apps/backend/app/services/refiner.py`
- `apps/backend/app/config.py`

## Final Note

This file is documentation only.

No backend code was changed.
