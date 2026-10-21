"""The critique-and-rewrite loop (LLM mocked)."""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.writing_loop import run_writing_loop

WEAK = "Responsible for migrating 12 services to Kubernetes"
PLAIN = "Built the internal search page"


def _resume() -> dict:
    return {
        "summary": "Platform engineer.",
        "workExperience": [
            {
                "title": "Engineer",
                "company": "Acme",
                "years": "2020 - 2023",
                "description": [WEAK, PLAIN],
                "descriptionStyles": ["bullet", "bullet"],
            }
        ],
        "additional": {"technicalSkills": ["Kubernetes"]},
    }


def _change(path: str, original: str, value: str) -> dict:
    return {
        "path": path,
        "action": "replace",
        "original": original,
        "value": value,
        "reason": "rubric",
    }


def _llm(*responses: dict) -> AsyncMock:
    return AsyncMock(side_effect=list(responses))


@pytest.mark.asyncio
async def test_rewrites_a_weak_opener_and_keeps_its_facts() -> None:
    llm = _llm(
        {"bullets": []},
        {
            "changes": [
                _change(
                    "workExperience[0].description[0]",
                    WEAK,
                    "Migrated 12 services to Kubernetes, ending hand-run deploys",
                )
            ]
        },
    )
    with patch("app.services.writing_loop.complete_json", llm):
        result = await run_writing_loop(_resume(), language="en")

    rows = result.data["workExperience"][0]["description"]
    assert rows[0] == "Migrated 12 services to Kubernetes, ending hand-run deploys"
    assert rows[1] == PLAIN
    assert result.report.rewritten_paths == ["workExperience[0].description[0]"]
    assert not any(f.rule == "weak_opener" for f in result.report.findings)
    assert llm.await_count == 2


@pytest.mark.asyncio
async def test_drops_a_rewrite_that_invents_a_number() -> None:
    llm = _llm(
        {"bullets": []},
        {
            "changes": [
                _change(
                    "workExperience[0].description[0]",
                    WEAK,
                    "Migrated 12 services to Kubernetes, cutting costs 30%",
                )
            ]
        },
    )
    with patch("app.services.writing_loop.complete_json", llm):
        result = await run_writing_loop(_resume(), language="en")

    assert result.data["workExperience"][0]["description"][0] == WEAK
    assert result.report.rewritten_paths == []
    assert result.report.rejected_rewrites == 1


@pytest.mark.asyncio
async def test_drops_a_rewrite_that_loses_a_skill() -> None:
    llm = _llm(
        {"bullets": []},
        {
            "changes": [
                _change(
                    "workExperience[0].description[0]",
                    WEAK,
                    "Migrated 12 services to a container platform",
                )
            ]
        },
    )
    with patch("app.services.writing_loop.complete_json", llm):
        result = await run_writing_loop(_resume(), language="en")

    assert result.data["workExperience"][0]["description"][0] == WEAK
    assert result.report.rejected_rewrites == 1


@pytest.mark.asyncio
async def test_critic_no_outcome_targets_a_line_the_rules_passed() -> None:
    llm = _llm(
        {
            "bullets": [
                {
                    "path": "workExperience[0].description[1]",
                    "no_outcome": True,
                    "weak_opener": False,
                    "note": "Say who uses the search page.",
                }
            ]
        },
        {
            "changes": [
                _change(
                    "workExperience[0].description[1]",
                    PLAIN,
                    "Built the internal search page the support team uses daily",
                )
            ]
        },
    )
    with patch("app.services.writing_loop.complete_json", llm):
        result = await run_writing_loop(_resume(), language="en", known_terms=[])

    prompt = llm.await_args_list[1].kwargs["prompt"]
    assert "workExperience[0].description[1] | no_outcome |" in prompt
    assert "workExperience[0].description[0] | weak_opener |" in prompt
    assert "workExperience[0].description[1]" in result.report.rewritten_paths
    # A rewritten line's note is not shown any more.
    assert result.report.critic_notes == []


@pytest.mark.asyncio
async def test_rewrite_disabled_still_critiques() -> None:
    llm = _llm(
        {
            "bullets": [
                {
                    "path": "workExperience[0].description[1]",
                    "no_outcome": True,
                    "weak_opener": False,
                    "note": "Say who uses it.",
                }
            ]
        }
    )
    with patch("app.services.writing_loop.complete_json", llm):
        result = await run_writing_loop(_resume(), language="en", rewrite=False)

    assert llm.await_count == 1
    assert result.data == _resume()
    assert [n.note for n in result.report.critic_notes] == ["Say who uses it."]
    assert any(f.rule == "weak_opener" for f in result.report.findings)


@pytest.mark.asyncio
async def test_critic_failure_falls_back_to_rules() -> None:
    llm = AsyncMock(
        side_effect=[
            RuntimeError("provider down"),
            {
                "changes": [
                    _change(
                        "workExperience[0].description[0]",
                        WEAK,
                        "Migrated 12 services to Kubernetes",
                    )
                ]
            },
        ]
    )
    progress: dict[str, str] = {}
    with patch("app.services.writing_loop.complete_json", llm):
        result = await run_writing_loop(_resume(), language="en", progress=progress)

    assert result.report.rewritten_paths == ["workExperience[0].description[0]"]
    assert progress["stage"] == "rewrite_writing"


@pytest.mark.asyncio
async def test_ignores_rewrites_of_lines_that_were_not_targeted() -> None:
    llm = _llm(
        {"bullets": []},
        {
            "changes": [
                _change("summary", "Platform engineer.", "Platform engineer at Acme."),
                _change(
                    "workExperience[0].description[0]",
                    WEAK,
                    "Migrated 12 services to Kubernetes — on time",
                ),
            ]
        },
    )
    with patch("app.services.writing_loop.complete_json", llm):
        result = await run_writing_loop(_resume(), language="en")

    assert result.data["summary"] == "Platform engineer."
    assert (
        result.data["workExperience"][0]["description"][0]
        == "Migrated 12 services to Kubernetes, on time"
    )
    assert result.report.rejected_rewrites == 1


@pytest.mark.asyncio
async def test_a_rewrite_with_a_shifted_path_is_matched_by_its_original() -> None:
    # Seen live: the model rewrote the right line but labelled the next index.
    llm = _llm(
        {"bullets": []},
        {
            "changes": [
                _change(
                    "workExperience[0].description[1]",
                    WEAK,
                    "Migrated 12 services to Kubernetes, ending hand-run deploys",
                )
            ]
        },
    )
    with patch("app.services.writing_loop.complete_json", llm):
        result = await run_writing_loop(_resume(), language="en")

    rows = result.data["workExperience"][0]["description"]
    assert rows == [
        "Migrated 12 services to Kubernetes, ending hand-run deploys",
        PLAIN,
    ]
    assert result.report.rewritten_paths == ["workExperience[0].description[0]"]
