"""Review fixes for skill-line restoration (PR #1042)."""

from typing import Any

import pytest

from app.services.parser import _MAX_SKILL_LINE_ITEMS, restore_skills_from_markdown


def _skills(data: dict[str, Any]) -> list[str]:
    return data["additional"]["technicalSkills"]


def _restore(parsed_skills: list[str], source: str) -> list[str]:
    parsed = {"additional": {"technicalSkills": list(parsed_skills)}}
    return _skills(restore_skills_from_markdown(parsed, source))


@pytest.mark.parametrize("separator", [", ", "  "])
def test_line_at_the_item_limit_is_still_restored(separator: str) -> None:
    extra = [f"Tool{i}" for i in range(_MAX_SKILL_LINE_ITEMS - 2)]
    line = separator.join(["Python", "Go", *extra])

    assert _restore(["Python", "Go"], line) == ["Python", "Go", *extra]


@pytest.mark.parametrize("separator", [", ", "  "])
def test_line_over_the_item_limit_is_rejected(separator: str) -> None:
    extra = [f"Tool{i}" for i in range(_MAX_SKILL_LINE_ITEMS - 1)]
    line = separator.join(["Python", "Go", *extra])

    assert _restore(["Python", "Go"], line) == ["Python", "Go"]
