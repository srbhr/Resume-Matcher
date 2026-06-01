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
