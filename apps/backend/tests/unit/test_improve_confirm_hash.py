"""Regression test for the improve/preview -> improve/confirm hash gate.

The bug: ``improve/preview`` hashes the RAW ``improved_data`` dict, while
``improve/confirm`` hashes its ``ResumeData`` round-trip
(``request.improved_data.model_dump()``). A resume that merely OMITS optional
fields — which ``ResumeData`` defaults to ``None`` — therefore hashes
differently on the two sides, so a valid tailoring is rejected with 400
("preview hash mismatch") whenever the stored ``processed_data`` is not already
schema-complete. ``_hash_improved_data`` must canonicalize through ``ResumeData``
so the two sides agree.
"""

from __future__ import annotations

from app.routers.resumes import _hash_improved_data
from app.schemas import ResumeData


def _canonical(data: dict) -> dict:
    return ResumeData.model_validate(data).model_dump()


def test_hash_is_stable_across_resumedata_roundtrip() -> None:
    # A resume whose personalProjects entry omits the optional github/website
    # fields (which ResumeData defaults to None) — exactly the non-canonical
    # stored-processed_data shape that triggers the confirm 400.
    raw = {
        "personalInfo": {"name": "Jane Doe", "email": "jane@x.dev"},
        "summary": "Backend engineer.",
        "personalProjects": [
            {
                "id": 1,
                "name": "Proj",
                "role": "Author",
                "years": "2022",
                "description": ["Built it"],
            }  # no github / website keys
        ],
    }
    # The raw dict and its schema-complete round-trip differ in key set...
    assert "github" not in raw["personalProjects"][0]
    assert "github" in _canonical(raw)["personalProjects"][0]
    # ...but their hashes MUST match, or preview (hashes raw) and confirm
    # (hashes the round-trip) disagree and reject a valid tailoring.
    assert _hash_improved_data(raw) == _hash_improved_data(_canonical(raw))


def test_hash_distinguishes_genuinely_different_resumes() -> None:
    # Anti-theater: canonicalization must NOT collapse real content differences.
    a = {"personalInfo": {"name": "Jane"}, "summary": "Backend engineer."}
    b = {"personalInfo": {"name": "Jane"}, "summary": "Frontend engineer."}
    assert _hash_improved_data(a) != _hash_improved_data(b)
