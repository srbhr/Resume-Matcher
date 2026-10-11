"""Per-entry ``condensed`` flag: schema, preservation, page fit and the ATS round trip."""

import copy
from typing import Any

import pytest

from app.mcp_server.tools._shared import tailoring_report
from app.schemas.models import Experience, ResumeData
from app.services.ats_parse.roundtrip import (
    canonical_resume_data,
    compute_roundtrip,
    expected_fields,
)
from app.services.bullet_selector import (
    count_bullets,
    drop_bullets,
    select_bullets,
    trim_order,
)
from app.services.resume_preservation import (
    finalize_ai_resume,
    validate_confirmed_resume,
)

pytestmark = pytest.mark.unit


def _source() -> dict[str, Any]:
    return {
        "personalInfo": {"name": "Ada Lovelace", "email": "ada@example.com"},
        "summary": "Backend engineer building Python services.",
        "workExperience": [
            {
                "id": 1,
                "title": "Staff Engineer",
                "company": "Alpha",
                "location": "London",
                "years": "2020 - Present",
                "description": ["Built Python APIs", "Documented releases"],
                "descriptionStyles": ["bullet", "bullet"],
                "condensed": False,
            },
            {
                "id": 2,
                "title": "Analyst",
                "company": "Beta",
                "location": "Paris",
                "years": "2004 - 2008",
                "description": ["Maintained the nightly batch jobs"],
                "descriptionStyles": ["bullet"],
                "condensed": True,
            },
        ],
        "education": [],
        "personalProjects": [],
        "additional": {
            "technicalSkills": ["Python"],
            "languages": [],
            "certificationsTraining": [],
            "awards": [],
        },
        "customSections": {},
    }


# -- schema ----------------------------------------------------------------------


def test_condensed_defaults_to_false_and_legacy_entries_validate_unchanged() -> None:
    legacy = {"title": "Engineer", "company": "Acme", "years": "2020 - 2021"}
    entry = Experience.model_validate(legacy)
    assert entry.condensed is False
    assert entry.model_dump() == {
        "id": 0,
        "title": "Engineer",
        "company": "Acme",
        "location": None,
        "years": "2020 - 2021",
        "description": [],
        "descriptionStyles": [],
        "condensed": False,
    }
    assert ResumeData.model_validate({"workExperience": [legacy]}).workExperience


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(True, True), (False, False), ("true", True), (None, False), ("no", False)],
)
def test_condensed_coerces_loose_values_instead_of_failing(
    raw: Any, expected: bool
) -> None:
    assert Experience.model_validate({"condensed": raw}).condensed is expected


def test_condensed_round_trips_through_resume_data() -> None:
    data = ResumeData.model_validate(_source()).model_dump()
    assert [e["condensed"] for e in data["workExperience"]] == [False, True]


# -- tailoring and preservation ----------------------------------------------------


def test_finalize_restores_a_flag_the_model_dropped() -> None:
    source = _source()
    candidate = copy.deepcopy(source)
    for entry in candidate["workExperience"]:
        entry.pop("condensed")
    finalized = finalize_ai_resume(source, candidate)
    assert [e["condensed"] for e in finalized["workExperience"]] == [False, True]


def test_finalize_restores_a_flag_the_model_flipped() -> None:
    source = _source()
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["condensed"] = True
    candidate["workExperience"][1]["condensed"] = False
    finalized = finalize_ai_resume(source, candidate)
    assert [e["condensed"] for e in finalized["workExperience"]] == [False, True]


def test_finalize_keeps_the_flag_with_its_entry_when_entries_are_reordered() -> None:
    source = _source()
    candidate = copy.deepcopy(source)
    candidate["workExperience"].reverse()
    finalized = finalize_ai_resume(source, candidate)
    assert [(e["id"], e["condensed"]) for e in finalized["workExperience"]] == [
        (2, True),
        (1, False),
    ]


def test_finalize_keeps_the_flag_of_an_entry_the_model_removed() -> None:
    source = _source()
    candidate = copy.deepcopy(source)
    del candidate["workExperience"][1]
    finalized = finalize_ai_resume(source, candidate)
    assert finalized["workExperience"][1]["condensed"] is True


def test_finalize_does_not_let_the_model_condense_a_legacy_entry() -> None:
    source = _source()
    for entry in source["workExperience"]:
        entry.pop("condensed")
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["condensed"] = True
    finalized = finalize_ai_resume(source, candidate)
    assert all("condensed" not in e for e in finalized["workExperience"])


def test_confirm_rejects_a_dropped_or_flipped_flag_but_accepts_legacy_payloads() -> (
    None
):
    source = _source()
    assert validate_confirmed_resume(source, copy.deepcopy(source)) == []

    flipped = copy.deepcopy(source)
    flipped["workExperience"][1]["condensed"] = False
    assert validate_confirmed_resume(source, flipped) == ["workExperience.identity"]

    dropped = copy.deepcopy(source)
    dropped["workExperience"][1].pop("condensed")
    assert validate_confirmed_resume(source, dropped) == ["workExperience.identity"]

    # A client that never learned the flag omits it; that reads as false.
    legacy_payload = copy.deepcopy(source)
    legacy_payload["workExperience"][0].pop("condensed")
    assert validate_confirmed_resume(source, legacy_payload) == []

    legacy_source = copy.deepcopy(source)
    legacy_source["workExperience"][1].pop("condensed")
    assert validate_confirmed_resume(legacy_source, copy.deepcopy(source)) == [
        "workExperience.identity"
    ]


def test_tailoring_report_flags_a_dropped_flag_and_offers_the_repair() -> None:
    source = ResumeData.model_validate(_source()).model_dump()
    candidate = copy.deepcopy(source)
    candidate["workExperience"][1]["condensed"] = False
    report = tailoring_report(source, candidate)
    assert report["valid"] is False
    assert any("workExperience[1].condensed" in v for v in report["violations"])
    assert report["repaired_resume_data"]["workExperience"][1]["condensed"] is True

    assert tailoring_report(source, copy.deepcopy(source))["valid"] is True


# -- page fit ----------------------------------------------------------------------


def test_bullet_harness_keeps_the_flag() -> None:
    source = _source()
    selection = select_bullets(source, {}, 1)
    assert [e["condensed"] for e in selection.data["workExperience"]] == [False, True]
    dropped = drop_bullets(source, [("workExperience", 0, 1)])
    assert [e["condensed"] for e in dropped["workExperience"]] == [False, True]


def test_page_fit_never_trims_the_hidden_bullets_of_a_condensed_entry() -> None:
    source = _source()
    source["workExperience"][1]["description"] = ["a", "b", "c"]
    source["workExperience"][1]["descriptionStyles"] = ["bullet"] * 3
    order = trim_order(source, {})
    assert order == [("workExperience", 0, 1)]  # one bullet of the full entry only
    source["workExperience"][1]["condensed"] = False
    assert {key[1] for key in trim_order(source, {})} == {0, 1}
    assert count_bullets(source) == 5


# -- ATS round trip ----------------------------------------------------------------


def _rendered() -> dict[str, Any]:
    return canonical_resume_data(_source())


def _names(data: dict[str, Any], template: str | None = None) -> list[str]:
    return [name for name, _ in expected_fields(data, template)[0]]


def test_condensed_entry_expects_title_company_and_years_after_full_entries() -> None:
    data = _rendered()
    data["workExperience"].insert(0, copy.deepcopy(data["workExperience"][1]))
    data["workExperience"][0]["id"] = 3  # an old role listed first, condensed
    names = [n for n in _names(data) if n.startswith("workExperience")]
    assert names == [
        "workExperience[1].title",
        "workExperience[1].company",
        "workExperience[1].years",
        "workExperience[1].location",
        "workExperience[1].description[0]",
        "workExperience[1].description[1]",
        "workExperience[0].title",
        "workExperience[0].company",
        "workExperience[0].years",
        "workExperience[2].title",
        "workExperience[2].company",
        "workExperience[2].years",
    ]


@pytest.mark.parametrize("template", [None, "swiss-two-column", "clean", "vivid"])
def test_condensed_line_order_does_not_follow_the_template(
    template: str | None,
) -> None:
    data = _rendered()
    names = [n for n in _names(data, template) if n.startswith("workExperience[1]")]
    assert names == [
        "workExperience[1].title",
        "workExperience[1].company",
        "workExperience[1].years",
    ]


def test_roundtrip_counts_a_condensed_line_as_fully_found() -> None:
    data = _rendered()
    text = "\n".join(
        [
            "Ada Lovelace",
            "ada@example.com",
            "Backend engineer building Python services.",
            "Staff Engineer",
            "Alpha",
            "2020 - Present",
            "London",
            "Built Python APIs",
            "Documented releases",
            "Earlier experience",
            "Analyst, Beta, 2004 - 2008",
            "Python",
        ]
    )
    roundtrip = compute_roundtrip(data, text)
    assert roundtrip.content_recall == 1.0
    assert roundtrip.order_fidelity == 1.0
    fields = {f.field for f in roundtrip.fields}
    assert "workExperience[1].title" in fields
    assert "workExperience[1].description[0]" not in fields
    assert "workExperience[1].location" not in fields
