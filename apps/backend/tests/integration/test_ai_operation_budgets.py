"""Operation boundaries use synthetic slow dependencies, never a provider."""

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.config import settings
from app.main import app
from app.routers import enrichment, resumes, resume_wizard
from app.schemas.enrichment import EnhanceRequest, RegenerateRequest, RegeneratedItem
from app.schemas.resume_wizard import ResumeWizardState


def item(index: int = 0) -> dict[str, Any]:
    return {
        "item_id": f"exp_{index}",
        "item_type": "experience",
        "title": "Engineer",
        "current_content": ["Built tools"],
    }


@pytest.mark.parametrize(
    "path,payload,target",
    [
        ("/resumes/improve/preview", {"resume_id": "r", "job_id": "j"}, "resume"),
        (
            "/resumes/improve/confirm",
            {"resume_id": "r", "job_id": "j", "improved_data": {}, "improvements": []},
            "resume",
        ),
        ("/enrichment/analyze/r", {}, "enrichment"),
        (
            "/enrichment/enhance",
            {
                "resume_id": "r",
                "answers": [{"question_id": "q", "answer": "Built tools"}],
            },
            "enrichment",
        ),
        (
            "/enrichment/regenerate",
            {"resume_id": "r", "items": [item()], "instruction": "Clarify"},
            "enrichment",
        ),
        ("/resumes/r/retry-processing", {}, "resume"),
        ("/resumes/r/generate-cover-letter", {}, "resume"),
        ("/resumes/r/generate-outreach", {}, "resume"),
        (
            "/resume-wizard/turn",
            {"state": {}, "action": "answer", "answer": {"text": "Ada"}},
            "wizard",
        ),
    ],
)
async def test_budget_includes_first_preload_or_stage(
    monkeypatch: pytest.MonkeyPatch, path: str, payload: dict[str, Any], target: str
) -> None:
    cancelled = asyncio.Event()

    async def slow(*args: Any, **kwargs: Any) -> dict[str, Any]:
        try:
            await asyncio.sleep(0.15)
            return {}
        except asyncio.CancelledError:
            cancelled.set()
            raise

    monkeypatch.setattr(settings, "request_timeout_seconds", 0.02)
    if target == "wizard":
        monkeypatch.setattr(resume_wizard, "run_ai_turn", slow)
    else:
        module = resumes if target == "resume" else enrichment
        monkeypatch.setattr(module.db, "get_resume", slow)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(f"/api/v1{path}", json=payload)
    assert response.status_code == 504
    assert cancelled.is_set()
    assert "timed out" in response.json()["detail"].lower()


@pytest.mark.parametrize(
    "payload",
    [
        {"items": [item(i) for i in range(21)]},
        {"items": [{**item(), "current_content": ["x" * 6001]}]},
        {"items": [{**item(), "current_content": ["x"] * 101}]},
    ],
)
def test_regenerate_input_bounds(payload: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        RegenerateRequest.model_validate(
            {"resume_id": "r", "instruction": "Improve", **payload}
        )


@pytest.mark.parametrize(
    "answers",
    [
        [{"question_id": "q", "answer": "x" * 6001}],
        [{"question_id": "q", "answer": "x", "question_text": "x" * 2001}],
        [{"question_id": "q", "answer": "x"}] * 41,
    ],
)
def test_enhancement_input_bounds(answers: list[dict[str, str]]) -> None:
    with pytest.raises(ValidationError):
        EnhanceRequest.model_validate({"resume_id": "r", "answers": answers})


def test_wizard_snapshot_bound() -> None:
    with pytest.raises(ValidationError):
        ResumeWizardState.model_validate({"resume_data": {"summary": "x" * 200001}})


def test_wizard_warning_payload_is_bounded() -> None:
    with pytest.raises(ValidationError):
        ResumeWizardState.model_validate({"warnings": ["review"] * 101})


async def test_prompt_limit_has_specific_api_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.ai_limits import MAX_PROMPT_CHARACTERS, PromptSizeError

    async def oversized(*args: Any, **kwargs: Any) -> Any:
        raise PromptSizeError(
            f"AI prompt exceeds the {MAX_PROMPT_CHARACTERS}-character limit"
        )

    monkeypatch.setattr(resume_wizard, "run_ai_turn", oversized)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/resume-wizard/turn",
            json={
                "state": {},
                "action": "answer",
                "answer": {"text": "Ada"},
            },
        )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        f"AI prompt exceeds the {MAX_PROMPT_CHARACTERS}-character limit"
    )


async def test_regeneration_limits_active_workers_and_keeps_item_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    active = peak = 0
    ready = asyncio.Event()
    release = asyncio.Event()

    async def regenerate(entry: Any, *args: Any) -> RegeneratedItem:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        if active == 4:
            ready.set()
        try:
            await release.wait()
            if entry.item_id == "exp_1":
                raise ValueError("Synthetic failure")
            return RegeneratedItem(
                **entry.model_dump(exclude={"current_content"}),
                new_content=["Built tools clearly"],
            )
        finally:
            active -= 1

    monkeypatch.setattr(
        enrichment.db,
        "get_resume",
        AsyncMock(return_value={"processed_data": {"summary": "Engineer"}}),
    )
    monkeypatch.setattr(enrichment, "_regenerate_experience_or_project", regenerate)
    request = RegenerateRequest(
        resume_id="r", items=[item(i) for i in range(10)], instruction="Clarify"
    )
    task = asyncio.create_task(enrichment.regenerate_items(request))
    await asyncio.wait_for(ready.wait(), 1)
    await asyncio.sleep(0)
    release.set()
    result = await task
    assert peak == 4
    assert active == 0
    assert len(result.regenerated_items) == 9
    assert [error.item_id for error in result.errors] == ["exp_1"]


@pytest.mark.parametrize(
    "path,payload",
    [
        ("/enrichment/analyze/r", {}),
        ("/resumes/improve/preview", {"resume_id": "r", "job_id": "j"}),
    ],
)
async def test_oversized_saved_source_rejected_before_ai(
    monkeypatch: pytest.MonkeyPatch, path: str, payload: dict[str, Any]
) -> None:
    monkeypatch.setattr(
        resumes.db,
        "get_resume",
        AsyncMock(return_value={"processed_data": {"summary": "x" * 200001}}),
    )
    monkeypatch.setattr(
        resumes.db, "get_job", AsyncMock(return_value={"content": "Engineer"})
    )
    ai = AsyncMock(side_effect=AssertionError("AI must not run"))
    monkeypatch.setattr(resumes, "_improve_preview_flow", ai)
    monkeypatch.setattr(enrichment, "complete_json", ai)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(f"/api/v1{path}", json=payload)
    assert response.status_code == 422
    ai.assert_not_awaited()


async def test_expired_regeneration_cancels_workers_and_queue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    active = started = 0

    async def blocked(*args: Any, **kwargs: Any) -> RegeneratedItem:
        nonlocal active, started
        active += 1
        started += 1
        try:
            await asyncio.sleep(10)
            raise AssertionError("Must cancel")
        finally:
            active -= 1

    monkeypatch.setattr(settings, "request_timeout_seconds", 0.03)
    monkeypatch.setattr(
        enrichment.db,
        "get_resume",
        AsyncMock(return_value={"processed_data": {"summary": "Engineer"}}),
    )
    monkeypatch.setattr(enrichment, "_regenerate_experience_or_project", blocked)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/enrichment/regenerate",
            json={
                "resume_id": "r",
                "items": [item(i) for i in range(10)],
                "instruction": "Clarify",
            },
        )
    assert response.status_code == 504
    assert started == 4
    assert active == 0


async def test_nested_budget_never_resets_and_context_is_restored() -> None:
    from app.ai_budget import operation_budget, remaining_timeout

    baseline = remaining_timeout(720)
    async with operation_budget(0.2):
        first = remaining_timeout(720)
        await asyncio.sleep(0.01)
        async with operation_budget(1800):
            second = remaining_timeout(720)
            assert 0 < second < first <= 0.2
    assert remaining_timeout(720) == baseline == 720


async def test_real_completion_wrapper_passes_declining_remaining_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from types import SimpleNamespace
    from app import llm
    from app.ai_budget import operation_budget

    timeouts: list[float] = []

    async def completion(**kwargs: Any) -> Any:
        timeouts.append(kwargs["timeout"])
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="Useful result"))]
        )

    config = llm.LLMConfig(
        provider="ollama",
        model="llama3",
        api_key="synthetic",
        api_base="http://unused.invalid",
    )
    monkeypatch.setattr(
        llm, "get_router", lambda _: (SimpleNamespace(acompletion=completion), config)
    )
    async with operation_budget(1800):
        await llm.complete("First", max_tokens=8192)
    assert timeouts == [480]
    async with operation_budget(0.2):
        await llm.complete("Second", max_tokens=8192)
        await asyncio.sleep(0.01)
        await llm.complete("Third", max_tokens=8192)
    assert 0 < timeouts[2] < timeouts[1] <= 0.2


async def test_expired_completion_preserves_deadline_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import llm
    from app import ai_budget
    from app.ai_budget import AIOperationDeadlineExceeded

    config = llm.LLMConfig(provider="openai", model="gpt-4o", api_key="synthetic")
    monkeypatch.setattr(
        llm,
        "get_router",
        lambda _: (AsyncMock(), config),
    )

    token = ai_budget._deadline.set(asyncio.get_running_loop().time() - 1)
    try:
        with pytest.raises(AIOperationDeadlineExceeded):
            await llm.complete("synthetic")
    finally:
        ai_budget._deadline.reset(token)


async def test_auxiliary_timeout_keeps_completed_output_and_returns_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def title(*args: Any, **kwargs: Any) -> str:
        return "Engineer"

    async def slow_cover(*args: Any, **kwargs: Any) -> str:
        await asyncio.sleep(1)
        return "late"

    monkeypatch.setattr(resumes, "generate_resume_title", title)
    monkeypatch.setattr(resumes, "generate_cover_letter", slow_cover)
    monkeypatch.setattr(resumes, "remaining_timeout", lambda: 0.02)

    cover, outreach, title_value, interview, warnings = (
        await resumes._generate_auxiliary_messages(
            {}, "Engineer", "en", True, False, False
        )
    )

    assert (cover, outreach, title_value, interview) == (None, None, "Engineer", None)
    assert warnings == ["Cover Letter generation failed"]


async def test_upload_deadline_cancels_conversion_before_persistence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cancelled = asyncio.Event()

    async def convert(*args: Any, **kwargs: Any) -> str:
        try:
            await asyncio.sleep(10)
            return "Resume"
        except asyncio.CancelledError:
            cancelled.set()
            raise

    monkeypatch.setattr(settings, "request_timeout_seconds", 0.02)
    monkeypatch.setattr(resumes, "parse_document", convert)
    create = AsyncMock(side_effect=AssertionError("Must not persist"))
    monkeypatch.setattr(resumes.db, "create_resume_atomic_master", create)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/resumes/upload",
            files={"file": ("test.pdf", b"%PDF-1.4 synthetic", "application/pdf")},
        )
    assert response.status_code == 504
    assert cancelled.is_set()
    create.assert_not_awaited()


async def test_caller_cancellation_propagates_without_waiting_for_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entered = asyncio.Event()
    cancelled = asyncio.Event()

    async def preload(*args: Any, **kwargs: Any) -> dict[str, Any]:
        entered.set()
        try:
            await asyncio.sleep(10)
            return {}
        except asyncio.CancelledError:
            cancelled.set()
            raise

    monkeypatch.setattr(resumes.db, "get_resume", preload)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        task = asyncio.create_task(
            client.post(
                "/api/v1/resumes/improve/preview",
                json={"resume_id": "r", "job_id": "j"},
            )
        )
        await asyncio.wait_for(entered.wait(), 1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert cancelled.is_set()


@pytest.mark.parametrize("retry", [False, True])
@pytest.mark.parametrize("concurrent", ["none", "retry", "delete"])
async def test_parse_deadline_marks_only_owned_processing_attempt_failed(
    monkeypatch: pytest.MonkeyPatch,
    isolated_db: Any,
    retry: bool,
    concurrent: str,
) -> None:
    entered = asyncio.Event()
    newer_token: str | None = None

    async def parse(_text: str) -> dict[str, Any]:
        nonlocal newer_token
        entered.set()
        records = await isolated_db.list_resumes()
        resume_id = records[0]["resume_id"]
        if concurrent == "retry":
            newer_token = await isolated_db.claim_resume_processing(resume_id)
        elif concurrent == "delete":
            await isolated_db.delete_resume(resume_id)
        await asyncio.sleep(10)
        return {}

    monkeypatch.setattr(settings, "request_timeout_seconds", 0.2)
    monkeypatch.setattr(resumes, "parse_resume_to_json", parse)
    monkeypatch.setattr(
        resumes, "parse_document", AsyncMock(return_value="Synthetic resume")
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        if retry:
            record = await isolated_db.create_resume_atomic_master(
                content="Synthetic resume",
                content_type="md",
                processing_status="failed",
            )
            response = await client.post(
                f"/api/v1/resumes/{record['resume_id']}/retry-processing"
            )
        else:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("test.pdf", b"%PDF-1.4 synthetic", "application/pdf")},
            )
    assert entered.is_set()
    assert response.status_code == 504
    records = await isolated_db.list_resumes()
    if concurrent == "delete":
        assert records == []
        return
    assert len(records) == 1
    assert records[0]["processing_status"] == (
        "processing" if newer_token else "failed"
    )
    from sqlalchemy import select
    from app.models import Resume

    async with isolated_db._session() as session:
        row = await session.scalar(
            select(Resume).where(Resume.resume_id == records[0]["resume_id"])
        )
        assert row is not None
        assert row.processing_token == newer_token


async def test_deadline_during_claim_retires_committed_owner_before_returning(
    monkeypatch: pytest.MonkeyPatch,
    isolated_db: Any,
) -> None:
    claim = isolated_db.claim_resume_processing

    async def slow_claim(*args: Any, **kwargs: Any) -> str | None:
        token = await claim(*args, **kwargs)
        await asyncio.sleep(0.1)
        return token

    monkeypatch.setattr(settings, "request_timeout_seconds", 0.04)
    monkeypatch.setattr(isolated_db, "claim_resume_processing", slow_claim)
    monkeypatch.setattr(
        resumes, "parse_document", AsyncMock(return_value="Synthetic resume")
    )
    parse = AsyncMock(side_effect=AssertionError("Expired operation must not parse"))
    monkeypatch.setattr(resumes, "parse_resume_to_json", parse)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/resumes/upload",
            files={"file": ("test.pdf", b"%PDF-1.4 synthetic", "application/pdf")},
        )
    assert response.status_code == 504
    parse.assert_not_awaited()
    records = await isolated_db.list_resumes()
    assert len(records) == 1
    assert records[0]["processing_status"] == "failed"


@pytest.mark.parametrize("failure,expected", [("deadline", 504), ("prompt", 422)])
@pytest.mark.parametrize("boundary", ["enhance", "preview", "direct", "cover-letter", "outreach", "interview-prep"])
async def test_dedicated_ai_failures_reach_api_boundary(
    monkeypatch: pytest.MonkeyPatch, sample_resume: dict[str, Any],
    failure: str, expected: int, boundary: str,
) -> None:
    from app.ai_budget import AIOperationDeadlineExceeded
    from app.ai_limits import PromptSizeError

    error = AIOperationDeadlineExceeded("expired") if failure == "deadline" else PromptSizeError("AI prompt exceeds the 512000-character limit")
    monkeypatch.setattr(resumes.db, "get_resume", AsyncMock(return_value={"processed_data": sample_resume, "content": "Synthetic source", "parent_id": "master"}))
    monkeypatch.setattr(resumes.db, "get_job", AsyncMock(return_value={"content": "Python engineer"}))
    monkeypatch.setattr(resumes.db, "get_improvement_by_tailored_resume", AsyncMock(return_value={"job_id": "j"}))
    if boundary == "enhance":
        monkeypatch.setattr(enrichment, "complete_json", AsyncMock(side_effect=error))
        path = "/enrichment/enhance"
        payload = {"resume_id": "r", "answers": [{"question_id": "q", "item_id": "exp_0", "answer": "Built Python tools"}]}
    elif boundary == "preview":
        monkeypatch.setattr(resumes, "_improve_preview_flow", AsyncMock(side_effect=error))
        path, payload = "/resumes/improve/preview", {"resume_id": "r", "job_id": "j"}
    elif boundary == "direct":
        monkeypatch.setattr(resumes, "extract_job_keywords", AsyncMock(side_effect=error))
        path, payload = "/resumes/improve", {"resume_id": "r", "job_id": "j"}
    else:
        service = {"cover-letter": "generate_cover_letter", "outreach": "generate_outreach_message", "interview-prep": "generate_interview_prep"}[boundary]
        monkeypatch.setattr(resumes, service, AsyncMock(side_effect=error))
        path, payload = f"/resumes/r/generate-{boundary}", {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"/api/v1{path}", json=payload)
    assert response.status_code == expected, response.text
    if failure == "prompt":
        assert response.json()["detail"].startswith("AI prompt exceeds")


@pytest.mark.parametrize("retry", [False, True])
@pytest.mark.parametrize("failure,expected", [("deadline", 504), ("prompt", 422)])
async def test_explicit_parse_boundary_failure_retires_owned_attempt(
    monkeypatch: pytest.MonkeyPatch, isolated_db: Any,
    retry: bool, failure: str, expected: int,
) -> None:
    from app.ai_budget import AIOperationDeadlineExceeded
    from app.ai_limits import PromptSizeError

    error = AIOperationDeadlineExceeded("expired") if failure == "deadline" else PromptSizeError("AI prompt exceeds the 512000-character limit")
    monkeypatch.setattr(resumes, "parse_document", AsyncMock(return_value="Synthetic resume"))
    monkeypatch.setattr(resumes, "parse_resume_to_json", AsyncMock(side_effect=error))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        if retry:
            record = await isolated_db.create_resume_atomic_master(content="Synthetic resume", content_type="md", processing_status="failed")
            response = await client.post(f"/api/v1/resumes/{record['resume_id']}/retry-processing")
        else:
            response = await client.post("/api/v1/resumes/upload", files={"file": ("synthetic.pdf", b"%PDF-1.4 synthetic", "application/pdf")})
    assert response.status_code == expected, response.text
    records = await isolated_db.list_resumes()
    assert len(records) == 1 and records[0]["processing_status"] == "failed"
    assert records[0]["processed_data"] is None


@pytest.mark.parametrize("failure", ["deadline", "prompt"])
async def test_auxiliary_boundary_failure_is_not_an_optional_item_error(
    monkeypatch: pytest.MonkeyPatch, failure: str,
) -> None:
    from app.ai_budget import AIOperationDeadlineExceeded
    from app.ai_limits import PromptSizeError

    kind = AIOperationDeadlineExceeded if failure == "deadline" else PromptSizeError
    monkeypatch.setattr(resumes, "generate_resume_title", AsyncMock(side_effect=kind("synthetic boundary")))
    with pytest.raises(kind):
        await resumes._generate_auxiliary_messages({}, "Engineer", "en", False, False, False)


@pytest.mark.parametrize("failure", ["deadline", "prompt"])
async def test_keyword_writer_preserves_dedicated_operation_failures(
    monkeypatch: pytest.MonkeyPatch, sample_resume: dict[str, Any], failure: str,
) -> None:
    from app.ai_budget import AIOperationDeadlineExceeded
    from app.ai_limits import PromptSizeError
    from app.services import refiner

    kind = AIOperationDeadlineExceeded if failure == "deadline" else PromptSizeError
    monkeypatch.setattr(refiner, "complete_json", AsyncMock(side_effect=kind("synthetic boundary")))
    with pytest.raises(kind):
        await refiner.inject_keywords(sample_resume, ["Kubernetes"], sample_resume, "Python engineer")


def test_preview_sized_resume_and_suggestions_remain_confirmable() -> None:
    from app.ai_limits import validate_source_size
    from app.schemas.models import ImproveResumeConfirmRequest, ResumeData

    candidate = ResumeData(summary="x" * 198_000).model_dump(mode="json")
    suggestions = [{"suggestion": "Valid suggestion " * 200, "lineNumber": None}]
    validate_source_size(candidate)
    validate_source_size(suggestions)
    request = ImproveResumeConfirmRequest.model_validate({"resume_id": "r", "job_id": "j", "improved_data": candidate, "improvements": suggestions})
    assert request.improved_data.summary == candidate["summary"]


@pytest.mark.parametrize("field", ["improved_data", "improvements", "resume_id"])
def test_confirm_still_rejects_each_oversized_source(field: str) -> None:
    from app.schemas.models import ImproveResumeConfirmRequest

    payload: dict[str, Any] = {"resume_id": "r", "job_id": "j", "improved_data": {}, "improvements": []}
    oversized = "x" * 200_001
    payload[field] = {"summary": oversized} if field == "improved_data" else [{"suggestion": oversized}] if field == "improvements" else oversized
    with pytest.raises(ValidationError):
        ImproveResumeConfirmRequest.model_validate(payload)
