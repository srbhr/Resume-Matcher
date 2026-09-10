"""Composed preview/confirm preservation and safe-warning regressions."""

import copy
from contextlib import ExitStack
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.models import ResumeData
from app.schemas.models import RefinementStats
from tests.integration.test_pipeline_e2e import _upload_resume


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _seed(isolated_db: Any, source: dict[str, Any]) -> tuple[str, str]:
    upload = await _upload_resume(isolated_db, source)
    resume_id = upload.json()["resume_id"]
    async with _client() as client:
        jobs = await client.post(
            "/api/v1/jobs/upload",
            json={
                "job_descriptions": [
                    "Backend Engineer at Example: Python and Kubernetes"
                ]
            },
        )
    return resume_id, jobs.json()["job_id"][0]


def _refinement_result(data: dict[str, Any]) -> SimpleNamespace:
    return SimpleNamespace(
        refined_data=data,
        passes_completed=1,
        ai_phrases_removed=[],
        keyword_analysis=None,
        final_match_percentage=50.0,
        alignment_report=SimpleNamespace(violations=[]),
        to_stats=lambda _initial: None,
    )


def _pipeline_patches(initial: dict[str, Any], refinement: object) -> tuple[Any, ...]:
    return (
        patch(
            "app.routers.resumes.extract_job_keywords",
            new_callable=AsyncMock,
            return_value={
                "keywords": ["Python"],
                "required_skills": ["Kubernetes"],
                "preferred_skills": [],
            },
        ),
        patch(
            "app.routers.resumes.generate_skill_target_plan",
            new_callable=AsyncMock,
            return_value={"accepted": [], "rejected": []},
        ),
        patch(
            "app.routers.resumes.verify_skill_target_plan",
            return_value={"accepted": [], "rejected": []},
        ),
        patch(
            "app.routers.resumes.generate_resume_diffs",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(changes=[]),
        ),
        patch(
            "app.routers.resumes.apply_diffs",
            return_value=(copy.deepcopy(initial), [], []),
        ),
        patch("app.routers.resumes.verify_diff_result", return_value=[]),
        patch(
            "app.routers.resumes.refine_resume",
            new_callable=AsyncMock,
            **(
                {"side_effect": refinement}
                if isinstance(refinement, Exception)
                else {"return_value": refinement}
            ),
        ),
        patch(
            "app.routers.resumes.generate_resume_title",
            new_callable=AsyncMock,
            return_value="Backend Engineer - Example",
        ),
    )


async def test_partial_final_writer_preview_confirms_and_reads_back_without_loss(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    source = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
    source["workExperience"][0]["descriptionStyles"][0] = "plain"
    source["customSections"] = {
        "talks": {
            "sectionType": "itemList",
            "items": [{"id": 9, "title": "PyCon", "description": ["Spoke on testing"]}],
        }
    }
    source = ResumeData.model_validate(source).model_dump()
    resume_id, job_id = await _seed(isolated_db, source)
    initial = copy.deepcopy(source)
    initial["summary"] = "Python backend engineer."
    partial = {
        "personalInfo": copy.deepcopy(source["personalInfo"]),
        "summary": "Python backend engineer for reliable systems.",
    }

    with ExitStack() as stack:
        for pipeline_patch in _pipeline_patches(initial, _refinement_result(partial)):
            stack.enter_context(pipeline_patch)
        async with _client() as client:
            preview = await client.post(
                "/api/v1/resumes/improve/preview",
                json={"resume_id": resume_id, "job_id": job_id},
            )
        assert preview.status_code == 200, preview.text
        preview_data = preview.json()["data"]
        preview_resume = preview_data["resume_preview"]
        for section in (
            "workExperience",
            "education",
            "personalProjects",
            "customSections",
        ):
            assert preview_resume[section] == source[section]

        mutated = copy.deepcopy(preview_resume)
        mutated["workExperience"][0]["company"] = "Moon Base"
        async with _client() as client:
            rejected = await client.post(
                "/api/v1/resumes/improve/confirm",
                json={
                    "resume_id": resume_id,
                    "job_id": job_id,
                    "improved_data": mutated,
                    "improvements": preview_data["improvements"],
                },
            )
        assert rejected.status_code == 400

        async with _client() as client:
            confirm = await client.post(
                "/api/v1/resumes/improve/confirm",
                json={
                    "resume_id": resume_id,
                    "job_id": job_id,
                    "improved_data": preview_resume,
                    "improvements": preview_data["improvements"],
                },
            )
        assert confirm.status_code == 200, confirm.text

    tailored_id = confirm.json()["data"]["resume_id"]
    stored = await isolated_db.get_resume(tailored_id)
    assert stored is not None
    for section in (
        "workExperience",
        "education",
        "personalProjects",
        "customSections",
    ):
        assert stored["processed_data"][section] == source[section]


async def test_schema_round_trip_preview_preserves_rows_styles_and_list_multiplicity(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    source = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
    source["workExperience"][0]["descriptionStyles"][0] = "plain"
    source["additional"]["technicalSkills"] = ["Python", "Python"]
    source["customSections"] = {
        "talks": {
            "sectionType": "itemList",
            "items": [
                {
                    "id": 9,
                    "title": "PyCon",
                    "description": ["Spoke on testing"],
                    "descriptionStyles": ["plain"],
                }
            ],
        },
        "topics": {
            "sectionType": "stringList",
            "strings": ["Reliability", "Reliability"],
        },
    }
    source = ResumeData.model_validate(source).model_dump()
    destructive_writer_result = copy.deepcopy(source)
    destructive_writer_result["workExperience"][0]["description"] = ["   "]
    destructive_writer_result["customSections"]["talks"]["items"][0][
        "description"
    ] = ["\t"]
    destructive_writer_result["additional"] = {}
    destructive_writer_result["customSections"]["topics"]["strings"] = []
    resume_id, job_id = await _seed(isolated_db, source)

    with ExitStack() as stack:
        for pipeline_patch in _pipeline_patches(
            source, _refinement_result(destructive_writer_result)
        ):
            stack.enter_context(pipeline_patch)
        async with _client() as client:
            preview = await client.post(
                "/api/v1/resumes/improve/preview",
                json={"resume_id": resume_id, "job_id": job_id},
            )
            assert preview.status_code == 200, preview.text
            preview_data = preview.json()["data"]
            preview_resume = preview_data["resume_preview"]
            confirm = await client.post(
                "/api/v1/resumes/improve/confirm",
                json={
                    "resume_id": resume_id,
                    "job_id": job_id,
                    "improved_data": preview_resume,
                    "improvements": preview_data["improvements"],
                },
            )

    assert confirm.status_code == 200, confirm.text
    assert preview_resume["workExperience"][0]["description"] == source[
        "workExperience"
    ][0]["description"]
    assert preview_resume["workExperience"][0]["descriptionStyles"] == source[
        "workExperience"
    ][0]["descriptionStyles"]
    assert preview_resume["additional"]["technicalSkills"] == ["Python", "Python"]
    assert preview_resume["customSections"] == source["customSections"]
    tailored_id = confirm.json()["data"]["resume_id"]
    stored = await isolated_db.get_resume(tailored_id)
    assert stored is not None
    assert stored["processed_data"] == preview_resume


async def test_duplicate_identity_reorder_preview_confirms_without_false_drift(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    source = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
    first = source["workExperience"][0]
    first["id"] = 0
    first["title"] = "Software Engineer"
    first["company"] = "Acme"
    first["years"] = "2019 - 2020"
    first["description"] = ["Built Python APIs"]
    first["descriptionStyles"] = ["bullet"]
    second = copy.deepcopy(first)
    second["years"] = "2021 - 2023"
    second["description"] = ["Maintained data pipelines"]
    source["workExperience"] = [first, second]
    candidate = copy.deepcopy(source)
    candidate["workExperience"].reverse()
    resume_id, job_id = await _seed(isolated_db, source)

    with ExitStack() as stack:
        for pipeline_patch in _pipeline_patches(
            source, _refinement_result(candidate)
        ):
            stack.enter_context(pipeline_patch)
        async with _client() as client:
            preview = await client.post(
                "/api/v1/resumes/improve/preview",
                json={"resume_id": resume_id, "job_id": job_id},
            )
            assert preview.status_code == 200, preview.text
            preview_data = preview.json()["data"]
            assert [
                entry["years"]
                for entry in preview_data["resume_preview"]["workExperience"]
            ] == ["2021 - 2023", "2019 - 2020"]

            confirm = await client.post(
                "/api/v1/resumes/improve/confirm",
                json={
                    "resume_id": resume_id,
                    "job_id": job_id,
                    "improved_data": preview_data["resume_preview"],
                    "improvements": preview_data["improvements"],
                },
            )

    assert confirm.status_code == 200, confirm.text


async def test_nested_preview_and_confirm_failures_return_only_safe_warning_codes(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    marker = "private-provider-marker-123"
    source = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
    resume_id, job_id = await _seed(isolated_db, source)

    patches = _pipeline_patches(source, RuntimeError(marker))
    with ExitStack() as stack:
        for pipeline_patch in patches:
            stack.enter_context(pipeline_patch)
        stack.enter_context(
            patch(
                "app.services.improver.calculate_resume_diff",
                side_effect=RuntimeError(marker),
            )
        )
        async with _client() as client:
            preview = await client.post(
                "/api/v1/resumes/improve/preview",
                json={"resume_id": resume_id, "job_id": job_id},
            )
        assert preview.status_code == 200, preview.text
        preview_data = preview.json()["data"]
        assert marker not in preview.text
        assert any(
            warning.startswith("REFINEMENT_FAILED:")
            for warning in preview_data["warnings"]
        )
        assert any(
            warning.startswith("DIFF_UNAVAILABLE:")
            for warning in preview_data["warnings"]
        )

        async with _client() as client:
            confirm = await client.post(
                "/api/v1/resumes/improve/confirm",
                json={
                    "resume_id": resume_id,
                    "job_id": job_id,
                    "improved_data": preview_data["resume_preview"],
                    "improvements": preview_data["improvements"],
                },
            )
        assert confirm.status_code == 200, confirm.text
        assert marker not in confirm.text
        assert any(
            warning.startswith("DIFF_UNAVAILABLE:")
            for warning in confirm.json()["data"]["warnings"]
        )


async def test_legacy_direct_improve_restores_unapproved_narrative_before_save(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    source = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
    source["workExperience"][0]["description"][0] = "Built Python APIs"
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"][0] = "Owned moon missions"
    resume_id, job_id = await _seed(isolated_db, source)

    with ExitStack() as stack:
        for pipeline_patch in _pipeline_patches(source, _refinement_result(candidate)):
            stack.enter_context(pipeline_patch)
        async with _client() as client:
            response = await client.post(
                "/api/v1/resumes/improve",
                json={"resume_id": resume_id, "job_id": job_id},
            )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["resume_preview"]["workExperience"][0]["description"][0] == (
        "Built Python APIs"
    )
    assert not any(
        warning.startswith("GROUNDING_REVIEW_REQUIRED:") for warning in data["warnings"]
    )
    stored = await isolated_db.get_resume(data["resume_id"])
    assert stored is not None
    assert stored["processed_data"]["workExperience"][0]["description"][0] == (
        "Built Python APIs"
    )


async def test_preview_metrics_count_only_keywords_in_finalized_resume(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    source = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
    source["workExperience"][0]["description"][0] = "Built Python APIs"
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"][0] = "Improved throughput by 500%"
    resume_id, job_id = await _seed(isolated_db, source)
    refinement = SimpleNamespace(
        refined_data=candidate,
        passes_completed=1,
        ai_phrases_removed=[],
        keyword_analysis=None,
        keywords_applied=["500%"],
        final_match_percentage=99.0,
        alignment_report=SimpleNamespace(violations=[]),
        to_stats=lambda initial: RefinementStats(
            passes_completed=1,
            passes_attempted=1,
            keywords_injected=1,
            initial_match_percentage=initial,
            final_match_percentage=99.0,
        ),
    )

    with ExitStack() as stack:
        for pipeline_patch in _pipeline_patches(source, refinement):
            stack.enter_context(pipeline_patch)
        async with _client() as client:
            response = await client.post(
                "/api/v1/resumes/improve/preview",
                json={"resume_id": resume_id, "job_id": job_id},
            )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert "500%" not in str(data["resume_preview"])
    assert data["refinement_stats"]["keywords_injected"] == 0
    assert data["refinement_stats"]["final_match_percentage"] != 99.0


async def test_preview_warning_allows_explicit_confirmation_of_narrative_rewrite(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    source = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
    source["workExperience"][0]["description"][0] = "Built Python APIs"
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"][0] = "Owned moon missions"
    resume_id, job_id = await _seed(isolated_db, source)

    with ExitStack() as stack:
        for pipeline_patch in _pipeline_patches(source, _refinement_result(candidate)):
            stack.enter_context(pipeline_patch)
        async with _client() as client:
            preview = await client.post(
                "/api/v1/resumes/improve/preview",
                json={"resume_id": resume_id, "job_id": job_id},
            )
            assert preview.status_code == 200, preview.text
            preview_data = preview.json()["data"]
            assert any(
                warning.startswith("GROUNDING_REVIEW_REQUIRED:")
                for warning in preview_data["warnings"]
            )
            assert (
                preview_data["resume_preview"]["workExperience"][0]["description"][0]
                == "Owned moon missions"
            )

            confirm = await client.post(
                "/api/v1/resumes/improve/confirm",
                json={
                    "resume_id": resume_id,
                    "job_id": job_id,
                    "improved_data": preview_data["resume_preview"],
                    "improvements": preview_data["improvements"],
                },
            )

    assert confirm.status_code == 200, confirm.text
    confirm_data = confirm.json()["data"]
    assert any(
        warning.startswith("GROUNDING_REVIEW_REQUIRED:")
        for warning in confirm_data["warnings"]
    )
    stored = await isolated_db.get_resume(confirm_data["resume_id"])
    assert stored is not None
    assert stored["processed_data"]["workExperience"][0]["description"][0] == (
        "Owned moon missions"
    )
