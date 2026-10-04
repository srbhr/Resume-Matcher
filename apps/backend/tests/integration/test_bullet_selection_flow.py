"""Preview -> confirm contract for harness bullet selection.

A preview requested with ``max_bullets_per_entry`` tailors from a CONDENSED
copy of the master. That condensed copy must replace the full master for every
source-dependent step (diff, preservation, registration) so that confirming the
exact returned payload still satisfies the preservation contract.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import ExitStack
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models import TailoringPreview
from app.schemas.models import ImproveDiffResult, ResumeChange, ResumeData
from app.services import tailor_selection
from app.services.bullet_selector import PageMeasureError
from app.services.refiner import refine_resume as real_refine_resume

WORK_BULLETS = [
    "Reduced checkout latency by profiling hot database queries",
    "Designed the event pipeline that feeds the analytics warehouse",
    "Organised weekly reading groups for the platform team",
    "Migrated the billing service from cron jobs to a queue",
    "Wrote runbooks covering the on-call escalation paths",
    "Introduced contract tests between the API and its consumers",
]
PROJECT_BULLETS = [
    "Published a CLI that scaffolds typed API clients",
    "Answered community questions on the issue tracker",
    "Added incremental generation for very large specs",
    "Benchmarked generators against three competing tools",
]
# Highest scores: work bullets 1, 3, 5 and project bullets 0, 2, 3.
SCORES = {
    **{
        ("workExperience", 0, i): float(s)
        for i, s in enumerate([10, 90, 20, 80, 30, 70])
    },
    **{("personalProjects", 0, i): float(s) for i, s in enumerate([60, 10, 50, 40])},
}
CONDENSED_WORK = [WORK_BULLETS[i] for i in (1, 3, 5)]
CONDENSED_PROJECTS = [PROJECT_BULLETS[i] for i in (0, 2, 3)]


def _master_data() -> dict[str, Any]:
    return ResumeData.model_validate(
        {
            "personalInfo": {
                "name": "Jane Doe",
                "title": "Senior Backend Engineer",
                "email": "jane@example.com",
            },
            "summary": "Backend engineer building reliable Python services.",
            "workExperience": [
                {
                    "id": 1,
                    "title": "Senior Backend Engineer",
                    "company": "Acme Corp",
                    "years": "Jan 2021 - Present",
                    "description": WORK_BULLETS,
                }
            ],
            "personalProjects": [
                {
                    "id": 1,
                    "name": "OpenAPI Generator",
                    "role": "Maintainer",
                    "years": "2021 - Present",
                    "description": PROJECT_BULLETS,
                }
            ],
            "additional": {"technicalSkills": ["Python", "Kubernetes"]},
        }
    ).model_dump()


@pytest.fixture
async def master(isolated_db: Any) -> dict[str, Any]:
    data = _master_data()
    return await isolated_db.create_resume_atomic_master(
        content=json.dumps(data),
        content_type="json",
        filename="master.json",
        processed_data=data,
        processing_status="ready",
    )


@pytest.fixture
async def job(isolated_db: Any, master: dict[str, Any]) -> dict[str, Any]:
    return await isolated_db.create_job(
        "Backend Engineer at Example: Python and Kubernetes", master["resume_id"]
    )


@pytest.fixture
async def client(isolated_db: Any) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest.fixture(autouse=True)
def pipeline(monkeypatch: pytest.MonkeyPatch) -> Any:
    """Patch every LLM boundary; the unrefined path keeps improved == source."""
    score_bullets = AsyncMock(return_value=(SCORES, "llm"))
    monkeypatch.setattr(tailor_selection, "score_bullets", score_bullets)
    with ExitStack() as stack:
        stack.enter_context(
            patch(
                "app.routers.resumes.extract_job_keywords",
                new_callable=AsyncMock,
                return_value={
                    "keywords": ["Python"],
                    "required_skills": ["Kubernetes"],
                    "preferred_skills": [],
                },
            )
        )
        stack.enter_context(
            patch(
                "app.routers.resumes.generate_skill_target_plan",
                new_callable=AsyncMock,
                return_value={"accepted": [], "rejected": []},
            )
        )
        stack.enter_context(
            patch(
                "app.routers.resumes.verify_skill_target_plan",
                return_value={"accepted": [], "rejected": []},
            )
        )
        stack.enter_context(
            patch(
                "app.routers.resumes.generate_resume_diffs",
                new_callable=AsyncMock,
                return_value=ImproveDiffResult(changes=[]),
            )
        )
        stack.enter_context(
            patch(
                "app.routers.resumes.refine_resume",
                new_callable=AsyncMock,
                side_effect=RuntimeError("refinement disabled for test"),
            )
        )
        stack.enter_context(
            patch(
                "app.routers.resumes.generate_resume_title",
                new_callable=AsyncMock,
                return_value="Backend Engineer - Example",
            )
        )
        yield score_bullets


async def _confirm(
    client: AsyncClient,
    master: dict[str, Any],
    job: dict[str, Any],
    data: dict[str, Any],
) -> Any:
    return await client.post(
        "/api/v1/resumes/improve/confirm",
        json={
            "resume_id": master["resume_id"],
            "job_id": job["job_id"],
            "preview_id": data["preview_id"],
            "improved_data": data["resume_preview"],
            "improvements": data["improvements"],
        },
    )


async def test_preview_condenses_to_three_per_entry_and_confirm_accepts(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any], isolated_db: Any
) -> None:
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={
            "resume_id": master["resume_id"],
            "job_id": job["job_id"],
            "max_bullets_per_entry": 3,
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    preview = data["resume_preview"]
    assert preview["workExperience"][0]["description"] == CONDENSED_WORK
    assert preview["personalProjects"][0]["description"] == CONDENSED_PROJECTS
    assert data["bullet_selection"]["bullets_before"] == 10
    assert data["bullet_selection"]["bullets_after"] == 6
    assert data["bullet_selection"]["page_fit"] == "skipped"
    removed = [
        c for c in (data["detailed_changes"] or []) if c.get("change_type") == "removed"
    ]
    assert removed == []  # diff is against the condensed source

    confirm = await _confirm(client, master, job, data)
    assert confirm.status_code == 200, confirm.text
    saved = await isolated_db.get_resume(confirm.json()["data"]["resume_id"])
    assert len(saved["processed_data"]["workExperience"][0]["description"]) == 3
    assert saved["parent_id"] == master["resume_id"]
    # The master itself is untouched.
    stored_master = await isolated_db.get_resume(master["resume_id"])
    assert (
        stored_master["processed_data"]["workExperience"][0]["description"]
        == WORK_BULLETS
    )


async def test_preview_without_max_bullets_keeps_full_source(
    client: AsyncClient,
    master: dict[str, Any],
    job: dict[str, Any],
    pipeline: AsyncMock,
) -> None:
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={"resume_id": master["resume_id"], "job_id": job["job_id"]},
    )
    assert res.status_code == 200, res.text
    assert (
        len(res.json()["data"]["resume_preview"]["workExperience"][0]["description"])
        == 6
    )
    assert res.json()["data"]["bullet_selection"] is None
    pipeline.assert_not_called()


async def test_preview_confirm_round_trip_when_under_cap(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any]
) -> None:
    # max 10 >= every entry -> selection is a no-op, confirm still succeeds.
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={
            "resume_id": master["resume_id"],
            "job_id": job["job_id"],
            "max_bullets_per_entry": 10,
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert len(data["resume_preview"]["workExperience"][0]["description"]) == 6
    assert (
        data["bullet_selection"]["bullets_after"]
        == data["bullet_selection"]["bullets_before"]
    )
    confirm = await _confirm(client, master, job, data)
    assert confirm.status_code == 200, confirm.text


async def test_preview_page_fit_trims_and_reports(
    client: AsyncClient,
    master: dict[str, Any],
    job: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def measure(data: dict[str, Any], fit: Any) -> int:
        total = sum(
            len(e["description"])
            for e in data["workExperience"] + data["personalProjects"]
        )
        return 1 if total <= 4 else 2

    monkeypatch.setattr(tailor_selection, "measure_page_count", measure)
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={
            "resume_id": master["resume_id"],
            "job_id": job["job_id"],
            "max_bullets_per_entry": 3,
            "page_fit": {"template": "swiss-single", "pageSize": "A4"},
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    sel = data["bullet_selection"]
    assert (
        sel["page_fit"] == "trimmed"
        and sel["trimmed_for_fit"] == 2
        and sel["final_pages"] == 1
    )
    total = sum(
        len(e["description"])
        for e in data["resume_preview"]["workExperience"]
        + data["resume_preview"]["personalProjects"]
    )
    assert total == 4
    assert not any(
        w == tailor_selection.PAGE_FIT_FINAL_OVER_WARNING for w in data["warnings"]
    )

    confirm = await _confirm(client, master, job, data)
    assert confirm.status_code == 200, confirm.text


async def test_final_page_check_warns_when_rewrite_overflows(
    client: AsyncClient,
    master: dict[str, Any],
    job: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[int] = []

    async def measure(data: dict[str, Any], fit: Any) -> int:
        calls.append(1)
        # The selection phase fits; the post-rewrite check reports two pages.
        return 1 if len(calls) == 1 else 2

    monkeypatch.setattr(tailor_selection, "measure_page_count", measure)
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={
            "resume_id": master["resume_id"],
            "job_id": job["job_id"],
            "max_bullets_per_entry": 3,
            "page_fit": {},
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["bullet_selection"]["page_fit"] == "fits"
    assert data["bullet_selection"]["final_pages"] == 2
    assert tailor_selection.PAGE_FIT_FINAL_OVER_WARNING in data["warnings"]


_RENDER_FAILS = -1


@pytest.mark.parametrize(
    ("page_fit", "renders", "expected_fit", "expected_check"),
    [
        ({}, [1, 1], "fits", "ok"),  # the rewritten result was measured
        ({}, [1, _RENDER_FAILS], "fits", "skipped"),  # the final render failed
        ({}, [2, 2], "over", None),  # no final check after an "over" fit
        (None, [], "skipped", None),  # no page fit requested
    ],
)
async def test_selection_summary_says_whether_the_final_check_ran(
    client: AsyncClient,
    master: dict[str, Any],
    job: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    page_fit: dict[str, Any] | None,
    renders: list[int],
    expected_fit: str,
    expected_check: str | None,
) -> None:
    """A stale selection-phase page count must not pass for a verified final fit."""
    results = iter(renders)

    async def measure(data: dict[str, Any], fit: Any) -> int:
        pages = next(results)
        if pages == _RENDER_FAILS:
            raise PageMeasureError("renderer busy")
        return pages

    monkeypatch.setattr(tailor_selection, "measure_page_count", measure)
    body: dict[str, Any] = {
        "resume_id": master["resume_id"],
        "job_id": job["job_id"],
        "max_bullets_per_entry": 3,
    }
    if page_fit is not None:
        body["page_fit"] = page_fit
    res = await client.post("/api/v1/resumes/improve/preview", json=body)
    assert res.status_code == 200, res.text
    sel = res.json()["data"]["bullet_selection"]
    assert sel["page_fit"] == expected_fit
    assert sel["final_check"] == expected_check
    assert next(results, None) is None  # every scripted render happened


async def test_slow_final_render_never_fails_the_preview(
    client: AsyncClient,
    master: dict[str, Any],
    job: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Spec §7: a render that outlives the operation budget skips the final check."""
    calls: list[int] = []
    never = asyncio.Event()

    async def measure(data: dict[str, Any], fit: Any) -> int:
        calls.append(1)
        if len(calls) == 1:
            return 1  # the selection phase fits at once
        await never.wait()  # the final check outlives any budget it is given
        return 3

    def remaining_budget() -> float:
        # Ample budget while fitting; only 50 ms past the reserve for the final
        # check. Independent of how long the other stages take on this machine.
        return (
            100.0 if not calls else tailor_selection.FINAL_CHECK_RESERVE_SECONDS + 0.05
        )

    monkeypatch.setattr(tailor_selection, "measure_page_count", measure)
    monkeypatch.setattr(tailor_selection, "remaining_timeout", remaining_budget)
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={
            "resume_id": master["resume_id"],
            "job_id": job["job_id"],
            "max_bullets_per_entry": 3,
            "page_fit": {},
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    sel = data["bullet_selection"]
    assert sel is not None and sel["page_fit"] == "fits"
    assert sel["final_pages"] != 3  # nothing claimed from the timed-out render
    assert sel["final_pages"] == 1  # still the selection-phase measurement
    assert sel["final_check"] == "skipped"  # ...and flagged as not re-checked
    assert tailor_selection.PAGE_FIT_FINAL_OVER_WARNING not in data["warnings"]
    assert data["preview_id"]
    assert len(calls) == 2  # the final check did start its render


def _preview_bullet_count(preview: dict[str, Any]) -> int:
    return sum(
        len(entry["description"])
        for entry in preview["workExperience"] + preview["personalProjects"]
    )


async def _selection_preview(
    client: AsyncClient,
    master: dict[str, Any],
    job: dict[str, Any],
    diff: ImproveDiffResult,
) -> dict[str, Any]:
    with patch(
        "app.routers.resumes.generate_resume_diffs",
        new_callable=AsyncMock,
        return_value=diff,
    ):
        res = await client.post(
            "/api/v1/resumes/improve/preview",
            json={
                "resume_id": master["resume_id"],
                "job_id": job["job_id"],
                "max_bullets_per_entry": 3,
            },
        )
    assert res.status_code == 200, res.text
    data: dict[str, Any] = res.json()["data"]
    return data


async def test_llm_append_cannot_push_a_role_past_the_cap(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any]
) -> None:
    """The harness fixes the bullet set; an LLM append on a condensed role is rejected."""
    diff = ImproveDiffResult(
        changes=[
            ResumeChange(
                path="workExperience[0].description",
                action="append",
                original=None,
                value="Operated Kubernetes clusters for Python services",
                reason="JD asks for Kubernetes",
            )
        ]
    )
    data = await _selection_preview(client, master, job, diff)
    preview = data["resume_preview"]
    assert preview["workExperience"][0]["description"] == CONDENSED_WORK
    # An expected harness refusal is logged server-side, not shown as a rejection.
    assert not any("rejected during verification" in w for w in data["warnings"])
    assert (
        data["bullet_selection"]["bullets_after"] == _preview_bullet_count(preview) == 6
    )

    confirm = await _confirm(client, master, job, data)
    assert confirm.status_code == 200, confirm.text


async def test_selection_warns_only_about_unexpected_rejections(
    client: AsyncClient,
    master: dict[str, Any],
    job: dict[str, Any],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A refused append is expected under selection; a failed verification is not."""
    caplog.set_level(logging.INFO, logger="app.services.improver")
    diff = ImproveDiffResult(
        changes=[
            ResumeChange(
                path="workExperience[0].description",
                action="append",
                original=None,
                value="Operated Kubernetes clusters for Python services",
                reason="JD asks for Kubernetes",
            ),
            ResumeChange(
                path="workExperience[0].description[0]",
                action="replace",
                original="A bullet the resume never had",
                value="Built Python services",
                reason="Emphasise Python",
            ),
        ]
    )
    data = await _selection_preview(client, master, job, diff)
    assert "1 change(s) rejected during verification" in data["warnings"]
    assert "append to a fixed bullet set" in caplog.text


async def test_selection_tells_the_diff_llm_the_bullet_set_is_fixed(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any]
) -> None:
    with patch(
        "app.routers.resumes.generate_resume_diffs",
        new_callable=AsyncMock,
        return_value=ImproveDiffResult(changes=[]),
    ) as diffs:
        res = await client.post(
            "/api/v1/resumes/improve/preview",
            json={
                "resume_id": master["resume_id"],
                "job_id": job["job_id"],
                "max_bullets_per_entry": 3,
            },
        )
    assert res.status_code == 200, res.text
    assert diffs.await_args is not None
    assert diffs.await_args.kwargs["fixed_row_sections"] == (
        "workExperience",
        "personalProjects",
    )


async def test_legacy_preview_keeps_bullet_appends_and_rejection_warnings(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any]
) -> None:
    """Without max_bullets_per_entry the diff LLM may append and every rejection warns."""
    diff = ImproveDiffResult(
        changes=[
            ResumeChange(
                path="workExperience[0].description",
                action="append",
                original=None,
                value="Operated Kubernetes clusters for Python services",
                reason="JD asks for Kubernetes",
            ),
            ResumeChange(
                path="workExperience[0].description[0]",
                action="replace",
                original="A bullet the resume never had",
                value="Built Python services",
                reason="Emphasise Python",
            ),
        ]
    )
    with patch(
        "app.routers.resumes.generate_resume_diffs",
        new_callable=AsyncMock,
        return_value=diff,
    ) as diffs:
        res = await client.post(
            "/api/v1/resumes/improve/preview",
            json={"resume_id": master["resume_id"], "job_id": job["job_id"]},
        )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert diffs.await_args is not None
    assert diffs.await_args.kwargs.get("fixed_row_sections", ()) == ()
    assert data["resume_preview"]["workExperience"][0]["description"] == [
        *WORK_BULLETS,
        "Operated Kubernetes clusters for Python services",
    ]
    assert "1 change(s) rejected during verification" in data["warnings"]


async def test_rewrite_that_splits_a_bullet_cannot_grow_a_condensed_role(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any]
) -> None:
    """Any accepted append turns on appended rows; selected roles still keep their count."""
    diff = ImproveDiffResult(
        changes=[
            ResumeChange(
                path="additional.technicalSkills",
                action="append",
                original=None,
                value="Terraform",
                reason="JD lists Terraform",
            ),
            ResumeChange(
                path="workExperience[0].description[0]",
                action="replace",
                original=CONDENSED_WORK[0],
                value=(
                    "Designed the Python event pipeline that feeds the analytics warehouse\n"
                    "Built the event pipeline feeding the analytics warehouse in Python"
                ),
                reason="Emphasise Python",
            ),
        ]
    )
    data = await _selection_preview(client, master, job, diff)
    preview = data["resume_preview"]
    work = preview["workExperience"][0]["description"]
    assert len(work) == 3
    # Every harness-chosen bullet keeps its own row; the split rewrite stays one row.
    assert work[1:] == CONDENSED_WORK[1:]
    assert "Designed the Python event pipeline" in work[0] and "\n" not in work[0]
    assert (
        data["bullet_selection"]["bullets_after"] == _preview_bullet_count(preview) == 6
    )

    confirm = await _confirm(client, master, job, data)
    assert confirm.status_code == 200, confirm.text


async def test_split_rewrite_keeps_every_chosen_bullet_through_the_real_refiner(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any]
) -> None:
    """Production path: the real refiner runs (only its LLM fails) after the split rewrite."""
    diff = ImproveDiffResult(
        changes=[
            ResumeChange(
                path="workExperience[0].description[0]",
                action="replace",
                original=CONDENSED_WORK[0],
                value=(
                    "Designed the Python event pipeline that feeds the analytics warehouse\n"
                    "Built the event pipeline feeding the analytics warehouse in Python"
                ),
                reason="Emphasise Python",
            )
        ]
    )
    with (
        patch(
            "app.routers.resumes.refine_resume",
            new_callable=AsyncMock,
            side_effect=real_refine_resume,
        ) as refine,
        patch(
            "app.services.refiner.complete_json",
            new_callable=AsyncMock,
            side_effect=RuntimeError("keyword injection unavailable"),
        ),
    ):
        data = await _selection_preview(client, master, job, diff)
    assert refine.await_count == 1
    assert not any(w.startswith("REFINEMENT_FAILED") for w in data["warnings"])
    work = data["resume_preview"]["workExperience"][0]["description"]
    assert len(work) == 3
    assert work[1:] == CONDENSED_WORK[1:]
    assert "Designed the Python event pipeline" in work[0] and "\n" not in work[0]
    assert data["bullet_selection"]["bullets_after"] == _preview_bullet_count(
        data["resume_preview"]
    )

    confirm = await _confirm(client, master, job, data)
    assert confirm.status_code == 200, confirm.text


async def test_refiner_grounds_on_the_full_master_while_tailoring_the_condensed_set(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any]
) -> None:
    """Spec §4.3: dropped bullets are still true facts, so grounding uses the full master."""
    with patch(
        "app.routers.resumes.refine_resume",
        new_callable=AsyncMock,
        side_effect=RuntimeError("stop after capturing the call"),
    ) as refine:
        await _selection_preview(client, master, job, ImproveDiffResult(changes=[]))
    assert refine.await_args is not None
    kwargs = refine.await_args.kwargs
    assert kwargs["master_resume"]["workExperience"][0]["description"] == WORK_BULLETS
    assert (
        kwargs["master_resume"]["personalProjects"][0]["description"] == PROJECT_BULLETS
    )
    assert (
        kwargs["initial_tailored"]["workExperience"][0]["description"] == CONDENSED_WORK
    )


async def test_diff_llm_sees_only_the_condensed_source(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any]
) -> None:
    """The diff LLM gets the fitted JSON, so its indexes address condensed bullets."""
    with patch(
        "app.routers.resumes.generate_resume_diffs",
        new_callable=AsyncMock,
        return_value=ImproveDiffResult(changes=[]),
    ) as diffs:
        res = await client.post(
            "/api/v1/resumes/improve/preview",
            json={
                "resume_id": master["resume_id"],
                "job_id": job["job_id"],
                "max_bullets_per_entry": 3,
            },
        )
    assert res.status_code == 200, res.text
    kwargs = diffs.await_args.kwargs
    sent = json.loads(kwargs["original_resume"])
    assert sent == kwargs["original_resume_data"]
    assert sent["workExperience"][0]["description"] == CONDENSED_WORK
    assert sent["personalProjects"][0]["description"] == CONDENSED_PROJECTS


async def test_rewritten_condensed_bullet_confirms(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any], isolated_db: Any
) -> None:
    """A replace diff on a condensed index is applied, previewed and confirmed as-is."""
    rewritten = "Migrated the Python billing service from cron jobs to a queue"
    diff = ImproveDiffResult(
        changes=[
            ResumeChange(
                path="workExperience[0].description[1]",
                action="replace",
                original=CONDENSED_WORK[1],
                value=rewritten,
                reason="Emphasise Python",
            )
        ]
    )
    data = await _selection_preview(client, master, job, diff)
    expected = [CONDENSED_WORK[0], rewritten, CONDENSED_WORK[2]]
    assert data["resume_preview"]["workExperience"][0]["description"] == expected
    assert not any("rejected" in warning for warning in data["warnings"])

    confirm = await _confirm(client, master, job, data)
    assert confirm.status_code == 200, confirm.text
    saved = await isolated_db.get_resume(confirm.json()["data"]["resume_id"])
    assert saved["processed_data"]["workExperience"][0]["description"] == expected


CJK_BULLETS = [
    "负责设计并实现高并发的分布式支付系统",
    "主导数据库性能优化项目",
    "编写团队代码规范文档",
    "维护持续集成流水线",
]


async def test_condensed_cjk_source_reaches_the_diff_llm_verbatim(
    client: AsyncClient, isolated_db: Any, pipeline: AsyncMock
) -> None:
    """Year-only dates send the condensed JSON itself; CJK must not become \\uXXXX."""
    data = ResumeData.model_validate(
        {
            "personalInfo": {"name": "王伟", "email": "wang@example.com"},
            "summary": "后端工程师",
            "workExperience": [
                {
                    "id": 1,
                    "title": "后端工程师",
                    "company": "示例科技",
                    "years": "2020 - 2023",
                    "description": CJK_BULLETS,
                }
            ],
        }
    ).model_dump()
    master = await isolated_db.create_resume_atomic_master(
        content=json.dumps(data, ensure_ascii=False),
        content_type="json",
        filename="master.json",
        processed_data=data,
        processing_status="ready",
    )
    job = await isolated_db.create_job("后端工程师 Python", master["resume_id"])
    with patch(
        "app.routers.resumes.generate_resume_diffs",
        new_callable=AsyncMock,
        return_value=ImproveDiffResult(changes=[]),
    ) as diffs:
        res = await client.post(
            "/api/v1/resumes/improve/preview",
            json={
                "resume_id": master["resume_id"],
                "job_id": job["job_id"],
                "max_bullets_per_entry": 3,
            },
        )
    assert res.status_code == 200, res.text
    original_resume = diffs.await_args.kwargs["original_resume"]
    kept = [
        CJK_BULLETS[i] for i in (1, 2, 3)
    ]  # SCORES rank work bullets 1, 3, 2 highest
    assert json.loads(original_resume)["workExperience"][0]["description"] == kept
    assert kept[0] in original_resume and "王伟" in original_resume
    assert "\\u" not in original_resume


@pytest.mark.parametrize("value", [0, 11, -1])
async def test_max_bullets_per_entry_is_bounded(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any], value: int
) -> None:
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={
            "resume_id": master["resume_id"],
            "job_id": job["job_id"],
            "max_bullets_per_entry": value,
        },
    )
    assert res.status_code == 422


async def test_preview_registers_condensed_source_for_confirm(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any], isolated_db: Any
) -> None:
    """Confirm validates against the registered condensed source, not the full master."""
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={
            "resume_id": master["resume_id"],
            "job_id": job["job_id"],
            "max_bullets_per_entry": 3,
        },
    )
    assert res.status_code == 200, res.text
    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, res.json()["data"]["preview_id"])
    assert row is not None and row.source_data is not None
    assert row.source_data["workExperience"][0]["description"] == CONDENSED_WORK
    assert row.source_data["personalProjects"][0]["description"] == CONDENSED_PROJECTS


async def test_deleting_the_tailored_result_scrubs_the_condensed_source(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any], isolated_db: Any
) -> None:
    """The consumed marker left for a deleted result keeps no personal data."""
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={
            "resume_id": master["resume_id"],
            "job_id": job["job_id"],
            "max_bullets_per_entry": 3,
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    confirm = await _confirm(client, master, job, data)
    assert confirm.status_code == 200, confirm.text
    # Rows confirmed before confirm itself dropped the source copy still carry it.
    async with isolated_db._write_session() as session:
        row = await session.get(TailoringPreview, data["preview_id"])
        assert row is not None
        row.source_data = _master_data()
        await session.commit()

    assert await isolated_db.delete_resume(confirm.json()["data"]["resume_id"])

    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, data["preview_id"])
    assert row is not None  # the consumed marker stays so a retry cannot recreate it
    assert row.response_data is None
    assert row.source_data is None


async def test_confirm_scrubs_the_condensed_source_and_still_replays(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any], isolated_db: Any
) -> None:
    """A confirmed preview replays from response_data, so it keeps no source copy."""
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={
            "resume_id": master["resume_id"],
            "job_id": job["job_id"],
            "max_bullets_per_entry": 3,
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    confirm = await _confirm(client, master, job, data)
    assert confirm.status_code == 200, confirm.text
    tailored_id = confirm.json()["data"]["resume_id"]

    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, data["preview_id"])
    assert row is not None
    assert row.result_resume_id == tailored_id
    assert row.response_data is not None
    assert row.source_data is None

    replay = await _confirm(client, master, job, data)
    assert replay.status_code == 200, replay.text
    assert replay.json()["data"]["resume_id"] == tailored_id
    assert (
        replay.json()["data"]["resume_preview"]
        == confirm.json()["data"]["resume_preview"]
    )
    assert (
        len(await isolated_db.list_resumes()) == 2
    )  # master + one tailored, no second copy


async def test_legacy_preview_registers_no_source_snapshot(
    client: AsyncClient, master: dict[str, Any], job: dict[str, Any], isolated_db: Any
) -> None:
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={"resume_id": master["resume_id"], "job_id": job["job_id"]},
    )
    assert res.status_code == 200, res.text
    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, res.json()["data"]["preview_id"])
    assert row is not None and row.source_data is None
