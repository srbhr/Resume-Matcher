"""Flow moves (seed-master, tailor) + the pure scorer-runner.

The scorer-runner wraps the deterministic scorers already proven in
``tests/evals/scorers.py`` so the harness and the eval suite agree on what
"a good tailoring" means. (The HTTP moves are appended to this module in a
later task.)
"""

from __future__ import annotations

from typing import Any

from tests.evals.scorers import (
    is_valid_resume,
    jd_keywords_present,
    no_fabricated_employers,
    personal_info_unchanged,
    sections_preserved,
)


def score_tailoring(
    original: dict[str, Any], tailored: dict[str, Any], keywords: list[str]
) -> dict[str, Any]:
    """Run every structural scorer over an (original, tailored) pair."""
    return {
        "sections_preserved": sections_preserved(original, tailored),
        "fabricated_employers": no_fabricated_employers(original, tailored),
        "personal_info_unchanged": personal_info_unchanged(original, tailored),
        "is_valid_resume": is_valid_resume(tailored),
        "jd_keyword_coverage": jd_keywords_present(tailored, keywords),
    }
