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


@pytest.mark.parametrize(
    "line",
    [
        "Python, Java, Rust and Go",
        "Python, Java, Rust, and Go",
        "Python, Java, Rust or Go",
    ],
)
def test_final_conjunction_without_oxford_comma_splits_into_skills(line: str) -> None:
    assert _restore(["Python", "Java"], line) == ["Python", "Java", "Rust", "Go"]


def test_conjunction_rules_from_the_wrapped_sentence_guard_still_apply() -> None:
    # A mid-line "and ..." item or a dangling "and" is a wrapped sentence, not a list.
    assert _restore(["Python", "Java"], "Python, and Java, Rust, Go") == [
        "Python",
        "Java",
    ]
    assert _restore(["Python", "Java"], "Python, Java, Rust and") == ["Python", "Java"]


def test_final_ampersand_skill_is_not_split() -> None:
    assert _restore(["Python", "Java"], "Python, Java, Drag & Drop") == [
        "Python",
        "Java",
        "Drag & Drop",
    ]
    assert _restore(["Python", "Java"], "Python, Java, Rust and Go") == [
        "Python",
        "Java",
        "Rust",
        "Go",
    ]
