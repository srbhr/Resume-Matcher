"""LLM-as-judge eval for tailoring quality.

This is the layer the structural scorers cannot provide: it asks a *real* LLM
whether a tailored resume is actually good against its job description, scored
on a rubric (relevance, truthfulness, formatting). It is non-deterministic and
costs a model call, so:

* it is marked ``@pytest.mark.eval`` (excluded from the default selection in
  CI / quick runs), and
* it SKIPS unless the developer has an LLM key configured, using their own
  key/provider via ``app.llm`` — exactly the policy in
  ``docs/agent/testing-strategy.md`` §3.1.

CRITICAL: in a keyless environment this test must skip *before* it ever builds
or sends a request. ``_needs_key()`` is called as the very first statement in
the test body, so no real LLM call can happen ungated.

Run it on demand with a key configured::

    uv run pytest tests/evals -m eval
"""

import json

import pytest

from app.llm import complete_json, get_llm_config
from tests.evals.golden.cases import GOLDEN_CASES


def _needs_key() -> None:
    """Skip the calling test unless a usable LLM key/provider is configured.

    A key is considered "absent" only when there is no api_key AND the provider
    is not one of the local/self-hosted providers that legitimately run without
    one (``ollama``, ``openai_compatible``). This mirrors the gate used
    throughout the backend.
    """
    try:
        cfg = get_llm_config()
    except Exception as exc:  # corrupt/unreadable config.json — skip, don't hard-fail
        pytest.skip(f"could not read LLM config ({exc}); skipping LLM-judge eval")
    if not cfg.api_key and cfg.provider not in ("ollama", "openai_compatible"):
        pytest.skip("no LLM key configured; set one to run LLM-judge evals")


_JUDGE_RUBRIC = (
    "You are a strict but fair technical recruiter grading how well a resume "
    "was tailored to a job description. Grade on three axes:\n"
    "1. RELEVANCE — does the resume emphasize skills/experience the JD asks for?\n"
    "2. TRUTHFULNESS — does it avoid inventing employers, titles, or facts not "
    "implied by the candidate's history?\n"
    "3. FORMATTING — is it coherent, well-structured, and free of obvious "
    "artifacts?\n\n"
    "Return ONLY JSON of the form "
    '{{"score": <integer 1-5>, "reasons": "<one or two sentences>"}}. '
    "5 = excellent on all axes, 1 = poor. Be honest."
)


def _build_judge_prompt(job_description: str, tailored: dict) -> str:
    """Assemble the judge prompt for one (JD, tailored-resume) pair."""
    return (
        f"{_JUDGE_RUBRIC}\n\n"
        f"=== JOB DESCRIPTION ===\n{job_description}\n\n"
        f"=== TAILORED RESUME (JSON) ===\n"
        f"{json.dumps(tailored, ensure_ascii=False, indent=2)}\n"
    )


@pytest.mark.eval
async def test_llm_judge_scores_good_tailoring_highly():
    """A real LLM judge should rate a faithful, JD-aware tailoring >= 3/5.

    In keyless environments this skips at ``_needs_key()`` before any request
    is constructed or sent — it must NEVER make an ungated real call.
    """
    _needs_key()  # MUST be first — gates every line below behind a real key.

    case = GOLDEN_CASES[0]
    prompt = _build_judge_prompt(case["job_description"], case["tailored_good"])

    # One cheap call. schema_type="enrichment" keeps truncation heuristics
    # lenient for this small free-form JSON (not a full resume payload).
    result = await complete_json(
        prompt,
        system_prompt="You are an impartial resume-tailoring evaluator.",
        max_tokens=512,
        schema_type="enrichment",
    )

    assert isinstance(result, dict), f"judge returned non-dict: {result!r}"
    assert "score" in result, f"judge response missing 'score': {result!r}"

    score = int(result["score"])
    assert 1 <= score <= 5, f"score out of rubric range: {score}"
    assert score >= 3, (
        f"LLM judge scored the good tailoring below threshold: "
        f"score={score}, reasons={result.get('reasons')!r}"
    )
