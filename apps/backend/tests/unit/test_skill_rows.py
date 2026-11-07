"""Technical Skills keep their "---" row breaks through validation and AI edits."""

import pytest

from app.schemas.models import SKILL_ROW_BREAK, AdditionalInfo, has_skill_row_layout
from app.services.resume_preservation import (
    finalize_ai_resume,
    validate_confirmed_resume,
)


def test_technical_skills_keep_row_breaks() -> None:
    info = AdditionalInfo(
        technicalSkills=["Python", "---", "Lab: PCR, qPCR", "  ---  ", "- Excel"]
    )
    assert info.technicalSkills == [
        "Python",
        SKILL_ROW_BREAK,
        "Lab: PCR, qPCR",
        SKILL_ROW_BREAK,
        "Excel",
    ]


def test_row_breaks_survive_a_pasted_text_block() -> None:
    info = AdditionalInfo(technicalSkills="Python\n---\nPCR")
    assert info.technicalSkills == ["Python", SKILL_ROW_BREAK, "PCR"]


def test_other_lists_still_drop_the_marker() -> None:
    info = AdditionalInfo(
        languages=["English", "---"],
        certificationsTraining=["---"],
        awards=["Dean's List", "---"],
    )
    assert info.languages == ["English"]
    assert info.certificationsTraining == []
    assert info.awards == ["Dean's List"]


def _resume(skills: list[str]) -> dict:
    return {"additional": {"technicalSkills": list(skills)}}


def test_ai_rewrite_cannot_scramble_rows_laid_out_with_breaks() -> None:
    """Any AI path ends in finalize_ai_resume; it keeps the rows, adds new skills last."""
    rows = ["Python", "Go", "---", "Lab: PCR, qPCR", "---", "Excel"]
    candidate = ["Lab: PCR, qPCR", "Excel", "---", "Kubernetes", "Python", "Go"]

    finalized = finalize_ai_resume(_resume(rows), _resume(candidate))

    assert finalized["additional"]["technicalSkills"] == [*rows, "Kubernetes"]
    assert validate_confirmed_resume(_resume(rows), finalized) == []


def test_ai_rewrite_still_reorders_skills_without_breaks() -> None:
    finalized = finalize_ai_resume(
        _resume(["Python", "Go"]), _resume(["Kubernetes", "Go", "Python"])
    )
    assert finalized["additional"]["technicalSkills"] == ["Kubernetes", "Go", "Python"]


# Same strings as tests/skill-groups.test.ts: the backend mirrors that parser.
@pytest.mark.parametrize(
    ("skills", "expected"),
    [
        (["Python", "---", "Go"], True),
        (["Languages:", "Python", "Go", "Tools:", "Git"], True),
        (["实验室：", "PCR"], True),
        (["Microbiology: ", "Aseptic culture"], True),
        (["Lab: PCR, qPCR", "Data: Python, R"], False),
        (["ISO 9001:2015", "https://example.com", "A, B: C", ": nothing"], False),
        (["Python", "Go"], False),
    ],
)
def test_row_layout_detection(skills: list[str], expected: bool) -> None:
    assert has_skill_row_layout(skills) is expected


def test_ai_rewrite_keeps_skills_under_their_bare_labels() -> None:
    """A bare label owns the lines below it, so a reorder would move skills under
    the wrong label; a new skill must not join the last label's group either."""
    rows = ["Languages:", "Python", "Go", "Tools:", "Git"]
    candidate = ["Languages:", "Python", "Tools:", "Git", "Go", "Kubernetes"]

    finalized = finalize_ai_resume(_resume(rows), _resume(candidate))

    assert finalized["additional"]["technicalSkills"] == [
        *rows,
        SKILL_ROW_BREAK,
        "Kubernetes",
    ]
