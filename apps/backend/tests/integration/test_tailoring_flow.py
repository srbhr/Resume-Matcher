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
    source: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    *,
    hostile: bool = False,
) -> tuple[FakeLLM, str]:
    """A fake LLM whose diff appends one sentence to the summary.

    With ``hostile``, the same diff also renames the candidate and drops the
    month from the first job's dates: edits the pipeline must never keep.
    """
    new_summary = source["summary"] + " Builds FastAPI services on AWS."
    changes: list[dict[str, Any]] = [
        {
            "path": "summary",
            "action": "replace",
            "original": source["summary"],
            "value": new_summary,
            "reason": "Names the JD's stack.",
        }
    ]
    if hostile:
        changes += [
            {
                "path": "personalInfo.name",
                "action": "replace",
                "original": source["personalInfo"]["name"],
                "value": "Someone Else",
                "reason": "hostile",
            },
            {
                "path": "workExperience[0].years",
                "action": "replace",
                "original": source["workExperience"][0]["years"],
                "value": "2021 - Present",
                "reason": "hostile",
            },
        ]
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
            DIFF: lambda: {"changes": copy.deepcopy(changes)},
            CRITIQUE: lambda: {"findings": []},
        }
    )
    config = llm.LLMConfig(provider="openai", model="gpt-4o", api_key="synthetic")
    monkeypatch.setattr(llm, "get_router", lambda _config=None: (fake, config))
    # conftest fails the writing loop's LLM calls in every test; here the loop
    # goes through the same fake as every other step.
    monkeypatch.setattr("app.services.writing_loop.complete_json", llm.complete_json)
    return fake, new_summary


async def seed(db: Any, source: dict[str, Any]) -> tuple[str, str]:
    """A ready default master and one stored job; returns their IDs."""
    master = await db.create_resume_atomic_master(
        content=json.dumps(source), processed_data=source, processing_status="ready"
    )
    job = await db.create_job(JOB_DESCRIPTION)
    return master["resume_id"], job["job_id"]


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_preview_applies_the_llm_diff_through_the_real_pipeline(
    isolated_db: Any, source: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    fake, new_summary = tailoring_llm(source, monkeypatch)
    master_id, job_id = await seed(isolated_db, source)

    async with client() as http:
        response = await http.post(
            "/api/v1/resumes/improve/preview",
            json={"resume_id": master_id, "job_id": job_id},
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
    assert (await isolated_db.get_job(job_id)).get("preview_hash")


async def test_confirm_persists_the_previewed_resume_and_its_job_link(
    isolated_db: Any, source: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    _, new_summary = tailoring_llm(source, monkeypatch)
    master_id, job_id = await seed(isolated_db, source)

    async with client() as http:
        preview = (
            await http.post(
                "/api/v1/resumes/improve/preview",
                json={"resume_id": master_id, "job_id": job_id},
            )
        ).json()["data"]
        confirm = await http.post(
            "/api/v1/resumes/improve/confirm",
            json={
                "resume_id": master_id,
                "job_id": job_id,
                "preview_id": preview["preview_id"],
                "improved_data": preview["resume_preview"],
                "improvements": preview["improvements"],
            },
        )

    assert confirm.status_code == 200, confirm.text
    tailored_id = confirm.json()["data"]["resume_id"]
    stored = await isolated_db.get_resume(tailored_id)
    assert stored["parent_id"] == master_id
    assert stored["is_master"] is False
    assert stored["processed_data"]["summary"] == new_summary
    link = await isolated_db.get_improvement_by_tailored_resume(tailored_id)
    assert link["job_id"] == job_id and link["original_resume_id"] == master_id


async def test_queue_worker_tailors_through_the_same_pipeline(
    isolated_db: Any, source: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services.queue_worker import QueueManager

    _, new_summary = tailoring_llm(source, monkeypatch)
    master_id, _ = await seed(isolated_db, source)
    await isolated_db.create_queue_item(
        "q1", master_id, JOB_DESCRIPTION, rate_limit_seconds=0
    )

    await QueueManager().drain()

    item = await isolated_db.get_queue_item("q1")
    assert item["status"] == "completed", item["error"]
    stored = await isolated_db.get_resume(item["tailored_resume_id"])
    assert stored["parent_id"] == master_id
    assert stored["processed_data"]["summary"] == new_summary


async def tailor_via_preview(db: Any, source: dict[str, Any]) -> dict[str, Any]:
    master_id, job_id = await seed(db, source)
    async with client() as http:
        response = await http.post(
            "/api/v1/resumes/improve/preview",
            json={"resume_id": master_id, "job_id": job_id},
        )
    assert response.status_code == 200, response.text
    return response.json()["data"]["resume_preview"]


async def tailor_via_queue(db: Any, source: dict[str, Any]) -> dict[str, Any]:
    from app.services.queue_worker import QueueManager

    master_id, _ = await seed(db, source)
    await db.create_queue_item("q1", master_id, JOB_DESCRIPTION, rate_limit_seconds=0)
    await QueueManager().drain()
    item = await db.get_queue_item("q1")
    assert item["status"] == "completed", item["error"]
    return (await db.get_resume(item["tailored_resume_id"]))["processed_data"]


@pytest.mark.parametrize("tailor", [tailor_via_preview, tailor_via_queue])
async def test_a_hostile_diff_cannot_rename_the_candidate_or_drop_date_months(
    tailor: Callable[..., Any],
    isolated_db: Any,
    source: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, new_summary = tailoring_llm(source, monkeypatch, hostile=True)

    result = await tailor(isolated_db, source)

    assert result["summary"] == new_summary
    assert result["personalInfo"] == source["personalInfo"]
    assert result["workExperience"][0]["years"] == "Jan 2021 - Present"
