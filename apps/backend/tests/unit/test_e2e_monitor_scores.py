"""Offline tests for the scorer-runner (reuses tests/evals/scorers.py)."""

from __future__ import annotations

from e2e_monitor.flow import score_tailoring

_ORIGINAL = {
    "personalInfo": {"name": "Jane Doe", "email": "jane@x.dev"},
    "summary": "Backend engineer.",
    "workExperience": [{"company": "Acme", "title": "Engineer", "description": ["Built APIs"]}],
}


def test_score_tailoring_clean_pass() -> None:
    tailored = {
        "personalInfo": {"name": "Jane Doe", "email": "jane@x.dev"},
        "summary": "Backend engineer who builds Python APIs.",
        "workExperience": [{"company": "Acme", "title": "Engineer", "description": ["Built Python APIs"]}],
    }
    s = score_tailoring(_ORIGINAL, tailored, keywords=["python"])
    assert s["sections_preserved"] is True
    assert s["fabricated_employers"] == []
    assert s["personal_info_unchanged"] is True
    assert s["is_valid_resume"] is True
    assert s["jd_keyword_coverage"] == 1.0


def test_score_tailoring_flags_fabrication_and_identity_change() -> None:
    tailored = {
        "personalInfo": {"name": "CHANGED", "email": "jane@x.dev"},
        "summary": "Backend engineer.",
        "workExperience": [{"company": "FakeCorp", "title": "Engineer", "description": ["x"]}],
    }
    s = score_tailoring(_ORIGINAL, tailored, keywords=["python"])
    assert "FakeCorp" in s["fabricated_employers"]
    assert s["personal_info_unchanged"] is False
    assert s["jd_keyword_coverage"] == 0.0
