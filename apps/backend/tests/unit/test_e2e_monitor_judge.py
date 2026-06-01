"""Offline tests for judge score normalization."""
from __future__ import annotations
from e2e_monitor.judge import _normalize_score


def test_normalize_score_accepts_valid_ints() -> None:
    assert _normalize_score(4) == 4
    assert _normalize_score("3") == 3
    assert _normalize_score(2.0) == 2


def test_normalize_score_rejects_out_of_range_bool_and_junk() -> None:
    assert _normalize_score(0) is None
    assert _normalize_score(6) is None
    assert _normalize_score(True) is None   # bool is not a score
    assert _normalize_score("high") is None
    assert _normalize_score(None) is None


def test_normalize_score_rounds_and_rejects_non_finite() -> None:
    assert _normalize_score(4.9) == 5  # rounds, not truncates
    assert _normalize_score(4.4) == 4
    assert _normalize_score(float("inf")) is None  # non-finite -> fail closed
    assert _normalize_score(float("nan")) is None
    assert _normalize_score("inf") is None
