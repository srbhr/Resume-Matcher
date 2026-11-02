"""Text helpers stay linear on long runs that used to backtrack quadratically.

Each long input below took roughly 15-25s with the old patterns (quadratic in
the run length) and takes about a millisecond now.
"""

import re
import time
from collections.abc import Callable

import pytest

from app.services.improver import _METRIC_RE
from app.services.parser import _INLINE_CONJUNCTION_RE
from app.services.writing_quality import _starts_sentence, scrub_em_dashes

_LONG = 100_000
_BUDGET_SECONDS = 0.5


@pytest.mark.parametrize(
    ("label", "run"),
    [
        ("metric digits", lambda: _METRIC_RE.findall("1" * _LONG)),
        (
            "conjunction spaces",
            lambda: _INLINE_CONJUNCTION_RE.split("a" + " " * _LONG + "b"),
        ),
        ("comma spaces", lambda: scrub_em_dashes("a" + " " * _LONG + "b")),
        ("sentence tail", lambda: _starts_sentence("Led team" + ". " * _LONG)),
    ],
)
def test_long_runs_stay_linear(label: str, run: Callable[[], object]) -> None:
    start = time.perf_counter()
    run()
    assert time.perf_counter() - start < _BUDGET_SECONDS, label


def test_metric_matches_are_unchanged() -> None:
    assert _METRIC_RE.findall("Grew revenue 30% and 2x, saved $400; 12x34%") == [
        "30%",
        "2x",
        "$400",
        "12x",
        "34%",
    ]


def test_conjunction_split_is_unchanged() -> None:
    assert _INLINE_CONJUNCTION_RE.split("Rust  and  Go or C") == ["Rust", "Go", "C"]


def test_scrub_em_dashes_drops_space_before_comma() -> None:
    assert scrub_em_dashes("Led team — shipped  , fast") == "Led team, shipped, fast"


_OLD_SENTENCE_START = re.compile(r"(?:^|[.!?;:]\s+|\n)\W*$")


@pytest.mark.parametrize(
    "prefix",
    [
        "",
        "  ",
        "Led the team. ",
        "Led the team.",
        "Built X;\t",
        "Built X\n",
        "x._ ",
        "a. ...",
        "Used ",
    ],
)
def test_starts_sentence_matches_the_old_pattern(prefix: str) -> None:
    assert _starts_sentence(prefix) is bool(_OLD_SENTENCE_START.search(prefix))
