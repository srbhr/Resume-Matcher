# LLM Integration Guide

> **Multi-provider AI support, JSON handling, and prompt guidelines.**

## Multi-Provider Support

Backend uses LiteLLM to support multiple providers through a unified API:

| Provider             | Type  | Notes                                        |
| -------------------- | ----- | -------------------------------------------- |
| **Ollama**           | Local | Free, runs on your machine                   |
| **OpenAI**           | Cloud | GPT-5 Nano, GPT-4o                           |
| **Azure AI Foundry** | Cloud | Azure AI Inference / Foundry model endpoints |
| **Anthropic**        | Cloud | Claude Haiku 4.5                             |
| **Google Gemini**    | Cloud | Gemini 3 Flash                               |
| **OpenRouter**       | Cloud | Access to multiple models                    |
| **DeepSeek**         | Cloud | DeepSeek Chat                                |

## API Key Handling

API keys are passed directly to `litellm.acompletion()` via the `api_key` parameter (not via `os.environ`) to avoid race conditions in async contexts.

```python
# Correct
await litellm.acompletion(
    model=model,
    messages=messages,
    api_key=api_key  # Direct parameter
)

# Incorrect - don't use os.environ in async code
os.environ["OPENAI_API_KEY"] = key  # Race condition risk
```

## JSON Mode

The `complete_json()` function automatically enables `response_format={"type": "json_object"}` for providers that support it:

- OpenAI
- Anthropic
- Gemini
- DeepSeek
- Major OpenRouter models

## Retry Logic

LiteLLM's Router owns transport retries. The effective policy on the installed
LiteLLM 1.86.2 stack is:

| Error class                                       | Transport retries | Maximum provider calls |
| ------------------------------------------------- | ----------------- | ---------------------- |
| Authentication, bad request, content policy       | 0                 | 1                      |
| Timeout                                           | 2                 | 3                      |
| Internal server                                   | 2                 | 3                      |
| Rate limit or generic retryable transport failure | 3                 | 4                      |

The internal-server rule uses the Router's exception-local retry override
because LiteLLM 1.86.2 exposes the setting but omits that class from its policy
dispatcher. These counts describe bounded attempts; they do not measure
provider backoff, latency, or cost. Caller cancellation is propagated.

After a transport request returns, JSON completions include up to 2 automatic
content retries for malformed, empty, truncated, or schema-invalid responses.
The resume parser explicitly permits three content retries; the fourth sampling
value is 0.7 where supported. Valid sparse resumes do not trigger retries.
An exhausted transport error escapes immediately and does not start a content
retry. Content retries increase temperature for response variation when the
model supports sampling:

- Initial attempt: temperature 0.1
- First retry: temperature 0.3
- Second retry: temperature 0.5

## Temperature Support

`_supports_temperature()` determines whether `temperature` is sent at all.
Capability comes from LiteLLM's model registry, with narrow overrides for
restrictions the registry's supported-parameter list does not fully describe.

Reasoning GPT-5 models that do not offer a no-reasoning mode, including GPT-5
Nano, accept only the default temperature of `1`. Models whose registry entry
advertises `supports_none_reasoning_effort`, including GPT-5.1 and GPT-5.2,
also accept non-default temperatures when reasoning is omitted. In application
configuration, cleared reasoning is represented by `reasoning_effort=None`,
which omits the parameter; the schema does not accept the literal string
`"none"`. If an explicit reasoning mode such as `minimal` or `medium` is set,
non-default temperature is omitted. The regular `gpt-5-chat*` family stays on
LiteLLM's normal chat path and keeps registry-supported sampling.

OpenAI documents `none` as the default reasoning level for GPT-5.1 and GPT-5.2
in its [model guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2).
Versioned chat aliases follow their own registered capabilities rather than a
blanket `-chat` name exemption. Missing or malformed reasoning capability fields
produce a warning and omit non-default sampling, so registry drift fails conservatively.

The same registry/model/reasoning decision applies to OpenAI, Azure, and
registered `openai_compatible` aliases. This avoids a blanket
compatible-provider exemption: a gateway alias for GPT-5 Nano or a GPT-5.1/5.2
request with explicit reasoning remains restricted. Unknown aliases stay
conservative and omit temperature, while Ollama keeps its explicit local-model
fallback.

`_get_retry_temperature()` uses the same capability decision for content
retries. It returns `None` when sampling is restricted, so the provider applies
its default, and preserves retry variation when reasoning is cleared on a model
that supports no-reasoning sampling.

### PR #929 / issue #975 verification

On the tested LiteLLM 1.86.2 stack, the original default GPT-5 Nano failure
reported in PR #929 was **not reproduced**. The application already enables
`litellm.drop_params`, and LiteLLM removes Nano's unsupported non-default
temperature before the OpenAI SDK serializes the request. This is evidence
about that dependency stack, not a claim that every gateway accepts the same
parameters.

The reproduced regression was supported sampling being removed from GPT-5.1
and GPT-5.2 with reasoning cleared, and from `gpt-5-chat-latest`. The application
completion and JSON retry paths are covered by
`tests/integration/test_temperature_request_contract.py`: real LiteLLM and
OpenAI SDK serialization into an in-memory HTTP transport, using synthetic
credentials and no provider network traffic. Those tests also retain Nano,
explicit reasoning, explicit `1.0`, versioned chat aliases, both automatic retry
temperatures, and compatible-alias controls. No live
provider acceptance or output-quality claim is made by these tests.

## JSON Extraction

Robust bracket-matching algorithm in `_extract_json()` handles:

- Malformed responses
- Markdown code blocks
- Rejection of top-level arrays when an object is required
- Edge cases
- Infinite recursion protection when content starts with `{` but matching fails

Callers can pass a synchronous `response_validator` to `complete_json()`. The
validator runs inside the content retry budget, so a schema-valid JSON object
with missing task fields is retried like malformed JSON. Service validators
also run after the wrapper boundary to protect mocked or alternate completion
implementations. Empty lists remain valid for contracts where they have a
defined meaning, such as zero diffs or a sparse resume. Enhancement and
regeneration replacements require non-empty lists of non-blank strings.

## Optional generated text

Plain completions reject whitespace-only output. Resume confirmation still
saves the tailored resume if title, cover letter, outreach, or interview prep
generation fails, and records a warning for each missing attachment. Cover
letter, outreach, and title generation reject job descriptions longer than
100,000 characters before calling a provider.

## Error Handling Pattern

LLM functions log detailed errors server-side but return generic messages to clients:

```python
except Exception as e:
    logger.error(f"LLM completion failed: {e}")
    raise ValueError("LLM completion failed. Please check your API configuration.")
```

## Resume Grounding and Preservation

Prompt instructions are only the first layer of the resume truthfulness contract.
Every AI-authored whole-resume result passes through
`app.services.resume_preservation.finalize_ai_resume` before it can be previewed
or saved. The finalizer matches entries by their nonzero ID, then by stable
section-specific identity fields. It restores omitted entries, protected
identity and date fields, and row styles from the matched source entry. It also
removes extra narrative rows and new numeric claims that have no source
evidence.

Legitimate rephrasing remains editable. A substantial narrative rewrite with
weak source overlap is returned from preview with a stable
`GROUNDING_REVIEW_REQUIRED` warning, and confirmation is the user's explicit
approval. The legacy direct-improve route has no review step, so it restores
weakly grounded rewrites before saving. Content the user added before tailoring
is part of the source evidence.

Technical skills are the bounded exception: required or preferred JD skills
may be added only after the existing skill-target and master-alignment checks
admit them. Original skill-list items are always retained. Other additional
lists do not accept AI-invented entries.

Confirmation validates section and entry preservation again before persistence.
Warnings expose stable codes and field paths; provider and calculation exception
details stay in server logs.

## Adding Prompts

Add new prompt templates to `apps/backend/app/prompts/templates.py`.

### Prompt Guidelines

1. Use `{variable}` for substitution (single braces)
2. Include example JSON schemas for structured outputs
3. Keep instructions concise: "Output ONLY the JSON object, no other text"

### Example

```python
IMPROVE_BULLET = """
Improve this resume bullet point for a {job_title} position.

Current: {current_bullet}

Output ONLY the improved bullet point, no explanations.
"""
```

## Provider Configuration

Users configure their preferred AI provider via:

- Settings page: `/settings`
- API: `PUT /api/v1/config/llm-api-key`

Azure AI Foundry uses LiteLLM's `azure_ai/` route for generic Azure AI Inference endpoints. Foundry-hosted Azure OpenAI endpoints such as `https://<resource>.services.ai.azure.com/openai/v1/responses` are normalized to the service root and routed through LiteLLM's `azure/` provider automatically. Set `LLM_PROVIDER=azure_foundry`, `LLM_MODEL` to the Foundry model or deployment name, `LLM_API_BASE` to the Azure AI endpoint, and store the Foundry API key in the `azure_foundry` key slot.

## Health Checks

The `/api/v1/health` endpoint validates LLM connectivity.

> **Note**: Docker health checks must use `/api/v1/health` (not `/health`).

## Timeouts

Health checks use a 30-second transport timeout. Completion and JSON base transport timeouts are 120 and 180 seconds. `_calculate_timeout` multiplies the base by `max(1, max_tokens / 4096)` and a provider factor: Anthropic/Azure Foundry 1.2, OpenRouter 1.5, Ollama 2.0, and 1.0 for other providers. For example, an 8,192-token Ollama JSON call has a 720-second adaptive transport allowance when called outside an HTTP operation budget.

AI POST routes also have one absolute operation deadline, starting before validation/preloads and covering all stages, retries and persistence. Each model call uses the smaller of its adaptive transport allowance and the remaining operation time. Content retries recalculate the remaining time; nested work cannot restart the deadline. `REQUEST_TIMEOUT_SECONDS` defaults to 240 and supports 30–1,800 seconds. Align frontend `NEXT_PUBLIC_REQUEST_TIMEOUT_MS` and proxy settings when increasing it for a local model.

These are cooperative cancellation budgets. Owned document/PDF/database cleanup can finish after the work deadline. See [AI operation budgets](architecture/ai-operation-budgets.md) for source/collection limits, bounded item workers and cancellation ownership.

## Key Files

| File                                     | Purpose                        |
| ---------------------------------------- | ------------------------------ |
| `apps/backend/app/llm.py`                | LiteLLM wrapper with JSON mode |
| `apps/backend/app/prompts/templates.py`  | Prompt templates               |
| `apps/backend/app/prompts/enrichment.py` | Enrichment-specific prompts    |
| `apps/backend/app/config.py`             | Provider configuration         |
