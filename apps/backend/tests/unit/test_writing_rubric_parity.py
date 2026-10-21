"""Agent mode writes to the same rubric as the app's critique prompt."""

import re
from pathlib import Path

from app.prompts.writing import WRITING_RUBRIC

SKILL = Path(__file__).resolve().parents[4] / ".claude/skills/resume-matcher/SKILL.md"


def test_skill_rubric_matches_the_prompt_rubric() -> None:
    match = re.search(
        r"<!-- writing-rubric:start -->\n(.*?)\n<!-- writing-rubric:end -->",
        SKILL.read_text(encoding="utf-8"),
        re.DOTALL,
    )
    assert match, "SKILL.md lost its writing-rubric markers"
    assert match.group(1) == WRITING_RUBRIC
