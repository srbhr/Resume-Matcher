"""Plural phrases whose replacement is irregular (PR #1042 review)."""

import pytest

from app.services.refiner import remove_ai_phrases


def _clean(text: str) -> str:
    cleaned, _ = remove_ai_phrases({"summary": text})
    return cleaned["summary"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Ran a deep dive.", "Ran an analysis."),
        ("Ran deep dives.", "Ran analyses."),
        ("Deep dives helped.", "Analyses helped."),
        ("Rethought the paradigm.", "Rethought the approach."),
        ("Rethought paradigms.", "Rethought approaches."),
        ("Freed up bandwidths.", "Freed up capacities."),
        ("Found low-hanging fruits.", "Found quick wins."),
    ],
)
def test_plural_uses_the_phrase_specific_form(text: str, expected: str) -> None:
    assert _clean(text) == expected
