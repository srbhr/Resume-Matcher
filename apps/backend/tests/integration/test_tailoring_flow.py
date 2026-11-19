"""The tailoring pipeline driven through one LLM seam: the transport.

Only `app.llm.get_router` is replaced. Keyword extraction, the skill plan, the
diff, its application, the safety nets, the writing loop and persistence of the
preview all run for real, so moving these steps between modules (for example
out of `routers/resumes.py`) can't break these tests.
"""

import copy
import json
from collections.abc import Callable
from types import SimpleNamespace
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app import llm
from app.main import app
from app.schemas.models import ResumeData

JOB_DESCRIPTION = "Senior Backend Engineer at TechCorp: Python, FastAPI, Docker, AWS."

# Which prompt a request belongs to, by a phrase from that prompt. A follow-up
# replaces this with an explicit operation label passed to complete_json, so the
# fake stops depending on prompt wording.
KEYWORDS = "Extract job requirements as JSON"
SKILL_PLAN = "Build a concise skill target plan"
DIFF = "output a JSON object with targeted changes"
CRITIQUE = "You are a strict resume reviewer"


class FakeLLM:
    """Scripted LiteLLM Router: replies by prompt kind and records every request."""

    def __init__(self, replies: dict[str, Callable[[], dict[str, Any]]]) -> None:
        self.replies = replies
        self.calls: list[str] = []

    async def acompletion(self, **kwargs: Any) -> Any:
        text = " ".join(str(m["content"]) for m in kwargs.get("messages", []))
        kind = next((k for k in self.replies if k in text), "unscripted")
        self.calls.append(kind)
        reply = self.replies[kind]() if kind in self.replies else {}
        message = SimpleNamespace(content=json.dumps(reply), reasoning_content=None)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=message, finish_reason="stop")], usage=None
        )


@pytest.fixture
def source(sample_resume: dict[str, Any]) -> dict[str, Any]:
    return ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()


def tailoring_llm(
    source: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> tuple[FakeLLM, str]:
    """A fake LLM whose diff appends one sentence to the summary."""
    new_summary = source["summary"] + " Builds FastAPI services on AWS."
    fake = FakeLLM(
        {
            KEYWORDS: lambda: {
                "company": "TechCorp",
                "role": "Senior Backend Engineer",
                "required_skills": ["Python", "FastAPI"],
                "preferred_skills": ["Docker"],
                "keywords": ["AWS"],
            },
            SKILL_PLAN: lambda: {"target_skills": [], "strategy_notes": ""},
            DIFF: lambda: {
                "changes": [
                    {
                        "path": "summary",
                        "action": "replace",
                        "original": source["summary"],
                        "value": new_summary,
                        "reason": "Names the JD's stack.",
                    }
                ]
            },
            CRITIQUE: lambda: {"findings": []},
        }
    )
    config = llm.LLMConfig(provider="openai", model="gpt-4o", api_key="synthetic")
    monkeypatch.setattr(llm, "get_router", lambda _config=None: (fake, config))
    # conftest fails the writing loop's LLM calls in every test; here the loop
    # goes through the same fake as every other step.
    monkeypatch.setattr("app.services.writing_loop.complete_json", llm.complete_json)
    return fake, new_summary


async def test_preview_applies_the_llm_diff_through_the_real_pipeline(
    isolated_db: Any, source: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    fake, new_summary = tailoring_llm(source, monkeypatch)
    master = await isolated_db.create_resume_atomic_master(
        content=json.dumps(source), processed_data=source, processing_status="ready"
    )
    job = await isolated_db.create_job(JOB_DESCRIPTION)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/resumes/improve/preview",
            json={"resume_id": master["resume_id"], "job_id": job["job_id"]},
        )

    assert response.status_code == 200, response.text
    preview = response.json()["data"]
    assert preview["resume_id"] is None
    assert preview["resume_preview"]["summary"] == new_summary
    assert preview["resume_preview"]["personalInfo"] == source["personalInfo"]
    assert fake.calls[:3] == [KEYWORDS, SKILL_PLAN, DIFF]
    assert "unscripted" not in fake.calls
    # Preview persists nothing but the confirm handshake.
    assert (await isolated_db.get_stats())["total_resumes"] == 1
    assert (await isolated_db.get_job(job["job_id"])).get("preview_hash")
