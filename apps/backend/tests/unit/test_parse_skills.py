"""Skills the LLM drops while parsing a resume are restored from the source text.

Long, multi-line skill blocks get summarized by the parse LLM (a 60+ item block
came back as 16 technicalSkills), so every exported resume lost those skills.
restore_skills_from_markdown() puts back the missing items of source lines that
are clearly skill lists.
"""

import copy
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.prompts.templates import PARSE_RESUME_PROMPT
from app.services.parser import parse_resume_to_json, restore_skills_from_markdown

SOURCE = """\
Jane Doe
Senior Engineer

SKILLS
PostgreSQL, MongoDB, Redis, SQL Server, NoSQL
 Kubernetes, GKE, Docker, Persistent Volumes, Vercel, CI/CD
- Python, Rust, Java, C++, C#, TypeScript
Languages: English, Hindi, German

EXPERIENCE
Acme Corp, Berlin, Germany
- Built ingestion services with Python, Kafka, and Kubernetes for 40 teams.
- Reduced p95 latency by 30%, cut costs, and simplified on-call.
"""


def _parsed(skills: list[str]) -> dict[str, Any]:
    return {
        "personalInfo": {"name": "Jane Doe"},
        "additional": {"technicalSkills": list(skills), "languages": []},
    }


def _skills(data: dict[str, Any]) -> list[str]:
    return data["additional"]["technicalSkills"]


class TestRestoreSkillsFromMarkdown:
    def test_restores_items_dropped_from_skill_lines(self) -> None:
        parsed = _parsed(["PostgreSQL", "Redis", "Kubernetes", "Docker", "Python"])

        result = _skills(restore_skills_from_markdown(parsed, SOURCE))

        for skill in [
            "MongoDB",
            "SQL Server",
            "NoSQL",
            "GKE",
            "CI/CD",
            "Rust",
            "C++",
            "C#",
        ]:
            assert skill in result
        # Existing order is kept; restored items follow in source order.
        assert result[:5] == ["PostgreSQL", "Redis", "Kubernetes", "Docker", "Python"]
        assert result.index("MongoDB") < result.index("CI/CD") < result.index("Rust")

    def test_does_not_duplicate_case_insensitively(self) -> None:
        parsed = _parsed(["postgresql", "redis", "KUBERNETES", "docker", "python"])

        result = _skills(restore_skills_from_markdown(parsed, SOURCE))

        lowered = [s.casefold() for s in result]
        assert len(lowered) == len(set(lowered))
        assert "PostgreSQL" not in result  # already present as "postgresql"

    def test_ignores_lines_without_a_known_skill(self) -> None:
        # "English, Hindi, German" and "Acme Corp, Berlin, Germany" are comma lists
        # too, but nothing in them is a parsed skill.
        parsed = _parsed(["Python"])

        result = _skills(restore_skills_from_markdown(parsed, SOURCE))

        for not_a_skill in ["English", "Hindi", "German", "Acme Corp", "Berlin"]:
            assert not_a_skill not in result

    def test_ignores_sentences_that_mention_skills(self) -> None:
        parsed = _parsed(["Kafka"])

        result = _skills(restore_skills_from_markdown(parsed, SOURCE))

        assert result == ["Kafka"]  # the experience bullets are prose, not lists

    def test_strips_long_labels_and_gap_separated_labels(self) -> None:
        source = (
            "Application development and integration stack: TypeScript, Node.js, Vite\n"
            "Stack  Python, FastAPI, Celery\n"
        )
        parsed = _parsed(["TypeScript", "Python"])

        result = _skills(restore_skills_from_markdown(parsed, source))

        assert result == [
            "TypeScript",
            "Python",
            "Node.js",
            "Vite",
            "FastAPI",
            "Celery",
        ]

    def test_lines_with_fewer_than_three_items_are_skipped(self) -> None:
        parsed = _parsed(["Python"])

        result = restore_skills_from_markdown(parsed, "Python, Go\n")

        assert _skills(result) == ["Python"]

    def test_no_parsed_skills_is_noop(self) -> None:
        parsed = {"personalInfo": {"name": "Jane Doe"}}
        assert restore_skills_from_markdown(copy.deepcopy(parsed), SOURCE) == parsed

    def test_does_not_mutate_input(self) -> None:
        parsed = _parsed(["Python", "Docker"])
        before = copy.deepcopy(parsed)
        restore_skills_from_markdown(parsed, SOURCE)
        assert parsed == before


def test_parse_prompt_requires_every_skill() -> None:
    rule = PARSE_RESUME_PROMPT.lower()
    assert "every" in rule and "technicalskills" in rule
    assert "never summarize" in rule


@pytest.mark.asyncio
@patch("app.services.parser.complete_json", new_callable=AsyncMock)
async def test_parse_restores_skills_the_llm_dropped(
    mock_complete_json: AsyncMock,
) -> None:
    mock_complete_json.return_value = _parsed(["PostgreSQL", "Kubernetes", "Python"])

    result = await parse_resume_to_json(SOURCE)

    assert "CI/CD" in _skills(result)
    assert "MongoDB" in _skills(result)
