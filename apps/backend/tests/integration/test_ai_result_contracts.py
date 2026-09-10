"""ASGI and service contracts for structured and optional AI outputs."""

import copy
from typing import Any, Awaitable, Callable
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app import llm
from app.database import Database
from app.main import app
from app.preview import job_fingerprint, resume_fingerprint
from app.routers import enrichment, resumes
from app.schemas.models import ResumeData
from app.services import cover_letter, improver, parser


@pytest.fixture
def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _source_resume(
    database: Database,
    sample_resume: dict[str, Any],
) -> dict[str, Any]:
    return await database.create_resume(
        content="# Synthetic resume",
        processed_data=copy.deepcopy(sample_resume),
        processing_status="ready",
    )


def _enhance_request(resume_id: str, *, include_project: bool = False) -> dict[str, Any]:
    answers = [
        {
            "question_id": "q-exp",
            "answer": "Built a reliable service",
            "item_id": "exp_0",
            "question_text": "What did you build?",
        }
    ]
    if include_project:
        answers.append(
            {
                "question_id": "q-proj",
                "answer": "Maintained the project",
                "item_id": "proj_0",
                "question_text": "What was your role?",
            }
        )
    return {"resume_id": resume_id, "answers": answers}


async def test_enhancement_all_failed_has_distinct_outcome(
    client: AsyncClient,
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = await _source_resume(isolated_db, sample_resume)
    monkeypatch.setattr(
        enrichment,
        "complete_json",
        AsyncMock(side_effect=RuntimeError("synthetic provider failure")),
    )

    async with client:
        response = await client.post(
            "/api/v1/enrichment/enhance",
            json=_enhance_request(source["resume_id"]),
        )

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Failed to generate enhancements. Original resume content was preserved."
    )


async def test_enhancement_partial_failure_reports_item_error(
    client: AsyncClient,
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = await _source_resume(isolated_db, sample_resume)
    provider = AsyncMock(
        side_effect=[
            {"additional_bullets": ["Improved factual bullet"]},
            RuntimeError("synthetic project failure"),
        ]
    )
    monkeypatch.setattr(enrichment, "complete_json", provider)

    async with client:
        response = await client.post(
            "/api/v1/enrichment/enhance",
            json=_enhance_request(source["resume_id"], include_project=True),
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["item_id"] for item in body["enhancements"]] == ["exp_0"]
    assert [item["item_id"] for item in body["errors"]] == ["proj_0"]
    stored = await isolated_db.get_resume(source["resume_id"])
    assert stored is not None and stored["processed_data"] == sample_resume


@pytest.mark.parametrize(
    "provider_result",
    [
        {},
        {"additional_bullets": []},
        {"additional_bullets": "not a list"},
        {"additional_bullets": [1]},
        {"additional_bullets": ["   "]},
    ],
)
async def test_enhancement_rejects_non_meaningful_replacements(
    client: AsyncClient,
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    provider_result: dict[str, Any],
) -> None:
    source = await _source_resume(isolated_db, sample_resume)
    monkeypatch.setattr(
        enrichment, "complete_json", AsyncMock(return_value=provider_result)
    )

    async with client:
        response = await client.post(
            "/api/v1/enrichment/enhance",
            json=_enhance_request(source["resume_id"]),
        )

    assert response.status_code == 500
    stored = await isolated_db.get_resume(source["resume_id"])
    assert stored is not None and stored["processed_data"] == sample_resume


async def test_empty_enhancement_request_is_valid_empty_control(
    client: AsyncClient,
    isolated_db: Database,
    sample_resume: dict[str, Any],
) -> None:
    source = await _source_resume(isolated_db, sample_resume)
    async with client:
        response = await client.post(
            "/api/v1/enrichment/enhance",
            json={"resume_id": source["resume_id"], "answers": []},
        )

    assert response.status_code == 200
    assert response.json() == {"enhancements": [], "errors": []}


@pytest.mark.parametrize(
    "provider_result",
    [
        {},
        {"new_bullets": []},
        {"new_bullets": "not a list"},
        {"new_bullets": [False]},
        {"new_bullets": ["\t"]},
    ],
)
async def test_regeneration_rejects_non_meaningful_replacements(
    client: AsyncClient,
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    provider_result: dict[str, Any],
) -> None:
    source = await _source_resume(isolated_db, sample_resume)
    monkeypatch.setattr(
        enrichment, "complete_json", AsyncMock(return_value=provider_result)
    )
    request = {
        "resume_id": source["resume_id"],
        "items": [
            {
                "item_id": "exp_0",
                "item_type": "experience",
                "title": "Engineer",
                "current_content": ["Original factual bullet"],
            }
        ],
        "instruction": "Polish",
    }

    async with client:
        response = await client.post("/api/v1/enrichment/regenerate", json=request)

    assert response.status_code == 500
    stored = await isolated_db.get_resume(source["resume_id"])
    assert stored is not None and stored["processed_data"] == sample_resume


async def test_regeneration_partial_failure_preserves_original_resume(
    client: AsyncClient,
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = await _source_resume(isolated_db, sample_resume)
    monkeypatch.setattr(
        enrichment,
        "complete_json",
        AsyncMock(
            side_effect=[
                {"new_bullets": ["Validated factual bullet"]},
                RuntimeError("synthetic skills failure"),
            ]
        ),
    )
    request = {
        "resume_id": source["resume_id"],
        "items": [
            {
                "item_id": "exp_0",
                "item_type": "experience",
                "title": "Engineer",
                "current_content": ["Original factual bullet"],
            },
            {
                "item_id": "skills",
                "item_type": "skills",
                "title": "Skills",
                "current_content": ["Python"],
            },
        ],
        "instruction": "Polish",
    }

    async with client:
        response = await client.post("/api/v1/enrichment/regenerate", json=request)

    assert response.status_code == 200
    assert [item["item_id"] for item in response.json()["regenerated_items"]] == [
        "exp_0"
    ]
    assert [item["item_id"] for item in response.json()["errors"]] == ["skills"]
    stored = await isolated_db.get_resume(source["resume_id"])
    assert stored is not None and stored["processed_data"] == sample_resume


async def test_schema_validation_retries_inside_complete_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    invalid = llm.litellm.ModelResponse(
        choices=[{"message": {"content": "{}"}, "index": 0}]
    )
    valid = llm.litellm.ModelResponse(
        choices=[{"message": {"content": '{"changes": []}'}, "index": 0}]
    )
    router = AsyncMock()
    router.acompletion.side_effect = [invalid, valid]
    config = llm.LLMConfig(provider="openai", model="gpt-4o", api_key="synthetic")
    monkeypatch.setattr(llm, "get_router", lambda _config=None: (router, config))
    monkeypatch.setattr(llm, "_supports_json_mode", lambda _model: False)

    def require_changes(value: dict[str, Any]) -> dict[str, Any]:
        if "changes" not in value:
            raise ValueError("missing changes")
        return value

    result = await llm.complete_json(
        "synthetic", retries=1, response_validator=require_changes
    )

    assert result == {"changes": []}
    assert router.acompletion.await_count == 2


async def test_top_level_array_is_rejected_with_bounded_content_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = llm.litellm.ModelResponse(
        choices=[
            {
                "message": {"content": '[{"changes": []}, {"changes": []}]'},
                "index": 0,
            }
        ]
    )
    router = AsyncMock()
    router.acompletion.return_value = response
    config = llm.LLMConfig(provider="openai", model="gpt-4o", api_key="synthetic")
    monkeypatch.setattr(llm, "get_router", lambda _config=None: (router, config))
    monkeypatch.setattr(llm, "_supports_json_mode", lambda _model: False)

    with pytest.raises(ValueError, match="JSON object"):
        await llm.complete_json("synthetic", retries=1)

    assert router.acompletion.await_count == 2


async def test_parser_schema_error_retries_then_accepts_sparse_resume(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sparse = ResumeData.model_validate(
        {"personalInfo": {"name": "Sparse Candidate"}, "summary": "Engineer"}
    ).model_dump()
    responses = [
        llm.litellm.ModelResponse(
            choices=[{"message": {"content": "{}"}, "index": 0}]
        ),
        llm.litellm.ModelResponse(
            choices=[
                {
                    "message": {
                        "content": ResumeData.model_validate(sparse).model_dump_json()
                    },
                    "index": 0,
                }
            ]
        ),
    ]
    router = AsyncMock()
    router.acompletion.side_effect = responses
    config = llm.LLMConfig(provider="openai", model="gpt-4o", api_key="synthetic")
    monkeypatch.setattr(llm, "get_router", lambda _config=None: (router, config))
    monkeypatch.setattr(llm, "_supports_json_mode", lambda _model: False)
    monkeypatch.setattr(parser, "get_llm_config", lambda: config)
    monkeypatch.setattr(parser, "get_safe_max_tokens", lambda *_args, **_kwargs: 4096)

    result = await parser.parse_resume_to_json("Sparse Candidate, Engineer")

    assert result["personalInfo"]["name"] == "Sparse Candidate"
    assert result["workExperience"] == []
    assert router.acompletion.await_count == 2


@pytest.mark.parametrize(
    "provider_result",
    [{}, {"required_skills": [], "preferred_skills": [], "keywords": "Python"}],
)
async def test_keyword_service_rejects_wrong_task_schema(
    monkeypatch: pytest.MonkeyPatch,
    provider_result: dict[str, Any],
) -> None:
    monkeypatch.setattr(
        improver,
        "complete_json",
        AsyncMock(return_value=provider_result),
    )

    with pytest.raises(ValueError, match="keyword|requires"):
        await improver.extract_job_keywords("Python engineer")


async def test_keyword_service_accepts_explicit_empty_lists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    empty = {"required_skills": [], "preferred_skills": [], "keywords": []}
    monkeypatch.setattr(improver, "complete_json", AsyncMock(return_value=empty))

    assert await improver.extract_job_keywords("General role") == empty


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("key_responsibilities", None),
        ("experience_requirements", {"years": 5}),
        ("education_requirements", "Bachelor's degree"),
    ],
)
async def test_keyword_service_rejects_malformed_optional_list_fields(
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    invalid_value: object,
) -> None:
    result = {
        "required_skills": [],
        "preferred_skills": [],
        "keywords": [],
        field: invalid_value,
    }
    monkeypatch.setattr(improver, "complete_json", AsyncMock(return_value=result))

    with pytest.raises(ValueError, match=field):
        await improver.extract_job_keywords("General role")


@pytest.mark.parametrize(
    "provider_result",
    [{}, {"target_skills": "Python"}, {"target_skills": [{"skill": 3}]}],
)
async def test_skill_plan_service_rejects_wrong_task_schema(
    monkeypatch: pytest.MonkeyPatch,
    provider_result: dict[str, Any],
) -> None:
    monkeypatch.setattr(
        improver,
        "complete_json",
        AsyncMock(return_value=provider_result),
    )

    with pytest.raises(ValueError, match="skill|target_skills"):
        await improver.generate_skill_target_plan(
            {"additional": {"technicalSkills": []}},
            "Python engineer",
            {"required_skills": [], "preferred_skills": [], "keywords": []},
        )


async def test_skill_plan_service_accepts_explicit_empty_plan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    empty = {"target_skills": [], "strategy_notes": "No grounded additions"}
    monkeypatch.setattr(improver, "complete_json", AsyncMock(return_value=empty))

    assert await improver.generate_skill_target_plan(
        {"additional": {"technicalSkills": []}},
        "General role",
        {"required_skills": [], "preferred_skills": [], "keywords": []},
    ) == empty


@pytest.mark.parametrize("provider_result", [{}, {"changes": "none"}])
async def test_diff_service_rejects_wrong_task_schema(
    monkeypatch: pytest.MonkeyPatch,
    provider_result: dict[str, Any],
) -> None:
    monkeypatch.setattr(
        improver,
        "complete_json",
        AsyncMock(return_value=provider_result),
    )

    with pytest.raises(ValueError):
        await improver.generate_resume_diffs(
            "# Resume",
            "General role",
            {"required_skills": [], "preferred_skills": [], "keywords": []},
        )


async def test_diff_service_accepts_explicit_zero_diff_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        improver,
        "complete_json",
        AsyncMock(return_value={"changes": [], "strategy_notes": "No changes"}),
    )

    result = await improver.generate_resume_diffs(
        "# Resume",
        "General role",
        {"required_skills": [], "preferred_skills": [], "keywords": []},
    )
    assert result.changes == []
    assert result.strategy_notes == "No changes"


async def test_plain_completion_rejects_whitespace_only_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = llm.litellm.ModelResponse(
        choices=[{"message": {"content": " \n\t"}, "index": 0}]
    )
    router = AsyncMock()
    router.acompletion.return_value = response
    config = llm.LLMConfig(provider="openai", model="gpt-4o", api_key="synthetic")
    monkeypatch.setattr(llm, "get_router", lambda _config=None: (router, config))

    with pytest.raises(ValueError, match="configuration"):
        await llm.complete("synthetic")

    router.acompletion.assert_awaited_once()


@pytest.mark.parametrize(
    ("service", "args"),
    [
        (cover_letter.generate_cover_letter, ({"summary": "Engineer"},)),
        (cover_letter.generate_outreach_message, ({"summary": "Engineer"},)),
        (cover_letter.generate_resume_title, ()),
    ],
)
async def test_optional_generators_bound_job_description_before_provider(
    monkeypatch: pytest.MonkeyPatch,
    service: Callable[..., Awaitable[str]],
    args: tuple[Any, ...],
) -> None:
    completion = AsyncMock(return_value="valid")
    monkeypatch.setattr(cover_letter, "complete", completion)

    with pytest.raises(ValueError, match="100000"):
        await service(*args, "J" * 100_001)

    completion.assert_not_awaited()


async def test_optional_generators_accept_valid_text_within_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    completion = AsyncMock(
        side_effect=["  Cover letter  ", "  Outreach note  ", "'Engineer @ Acme'"]
    )
    monkeypatch.setattr(cover_letter, "complete", completion)
    monkeypatch.setattr(cover_letter, "load_config_file", lambda: {})

    assert await cover_letter.generate_cover_letter({}, "Short JD") == "Cover letter"
    assert (
        await cover_letter.generate_outreach_message({}, "Short JD")
        == "Outreach note"
    )
    assert await cover_letter.generate_resume_title("J" * 100_000) == "Engineer @ Acme"
    assert completion.await_count == 3


async def test_auxiliary_blank_and_failed_outputs_become_durable_warnings(
    client: AsyncClient,
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data = ResumeData.model_validate(sample_resume).model_dump()
    source = await isolated_db.create_resume(
        content="# Synthetic resume",
        processed_data=data,
        processing_status="ready",
    )
    job = await isolated_db.create_job("Python engineer at Acme")
    payload_hash = resumes._hash_improved_data(data)
    registered = await isolated_db.register_preview(
        source_id=source["resume_id"],
        job_id=job["job_id"],
        payload_hash=payload_hash,
        source_hash=resume_fingerprint(
            source["content"], source["processed_data"], source.get("original_markdown")
        ),
        job_hash=job_fingerprint(job["content"]),
        prompt_id="nudge",
        ttl_seconds=3600,
    )
    monkeypatch.setattr(
        resumes,
        "_load_config",
        lambda: {"enable_cover_letter": True, "enable_outreach_message": True},
    )
    monkeypatch.setattr(resumes, "get_content_language", lambda: "en")
    monkeypatch.setattr(
        resumes, "generate_resume_title", AsyncMock(return_value="   ")
    )
    monkeypatch.setattr(
        resumes, "generate_cover_letter", AsyncMock(return_value="\n")
    )
    monkeypatch.setattr(
        resumes,
        "generate_outreach_message",
        AsyncMock(side_effect=RuntimeError("synthetic outreach failure")),
    )

    async with client:
        response = await client.post(
            "/api/v1/resumes/improve/confirm",
            json={
                "preview_id": registered["preview_id"],
                "resume_id": source["resume_id"],
                "job_id": job["job_id"],
                "improved_data": data,
                "improvements": [],
            },
        )

    assert response.status_code == 200, response.text
    warnings = response.json()["data"]["warnings"]
    assert warnings == [
        "Title generation failed",
        "Cover Letter generation failed",
        "Outreach generation failed",
    ]
    stored = await isolated_db.get_resume(response.json()["data"]["resume_id"])
    assert stored is not None
    assert stored["processing_status"] == "ready"
    assert stored.get("title") is None
    assert stored.get("cover_letter") is None
    assert stored.get("outreach_message") is None
