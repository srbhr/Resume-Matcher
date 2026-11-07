"""Technical Skills keep their "---" row breaks through validation and AI edits."""

from app.schemas.models import SKILL_ROW_BREAK, AdditionalInfo
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
