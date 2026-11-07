"""Technical Skills keep their "---" row breaks through validation (jochuan#1)."""

from app.schemas.models import SKILL_ROW_BREAK, AdditionalInfo


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
