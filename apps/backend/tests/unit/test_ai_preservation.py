"""Final AI-output preservation and grounding policy controls."""

import copy
from typing import Any
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace

import pytest

from app.schemas.models import ResumeData
from app.services.parser import restore_dates_from_markdown
from app.services.refiner import refine_resume
from app.services.resume_preservation import (
    GROUNDING_REVIEW_CODE,
    finalize_ai_resume,
    grounding_review_warnings,
    validate_confirmed_resume,
)
from app.schemas.refinement import RefinementConfig
from app.routers import resumes


def _source_resume() -> dict[str, Any]:
    return {
        "personalInfo": {"name": "Ada Lovelace", "email": "ada@example.com"},
        "summary": "Backend engineer building Python services.",
        "workExperience": [
            {
                "id": 1,
                "title": "Engineer",
                "company": "Alpha",
                "years": "Jan 2020 - Mar 2021",
                "description": ["Built Python APIs", "Documented releases"],
                "descriptionStyles": ["plain", "bullet"],
            },
            {
                "id": 2,
                "title": "Lead",
                "company": "Beta",
                "years": "Apr 2020 - Dec 2021",
                "description": ["Led service migrations"],
                "descriptionStyles": ["bullet"],
            },
        ],
        "education": [
            {
                "id": 4,
                "institution": "Example University",
                "degree": "BSc",
                "years": "2016 - 2020",
                "description": "Computer science",
            }
        ],
        "personalProjects": [
            {
                "id": 7,
                "name": "Parser",
                "role": "Maintainer",
                "years": "May 2021 - Present",
                "description": ["Parsed documents"],
                "descriptionStyles": ["plain"],
            }
        ],
        "additional": {
            "technicalSkills": ["Python"],
            "languages": ["English"],
            "certificationsTraining": [],
            "awards": [],
        },
        "customSections": {
            "talks": {
                "sectionType": "itemList",
                "items": [
                    {
                        "id": 9,
                        "title": "Reliable systems",
                        "subtitle": "PyCon",
                        "years": "Jun 2023",
                        "description": ["Presented testing methods"],
                        "descriptionStyles": ["plain"],
                    }
                ],
            }
        },
    }


def test_final_writer_cannot_erase_populated_source_sections() -> None:
    source = _source_resume()
    partial = {
        "personalInfo": copy.deepcopy(source["personalInfo"]),
        "summary": "Python backend engineer.",
    }

    finalized = finalize_ai_resume(source, partial)

    assert finalized["summary"] == "Python backend engineer."
    for section in (
        "workExperience",
        "education",
        "personalProjects",
        "customSections",
    ):
        assert finalized[section] == source[section]


def test_reordered_entries_keep_their_identity_dates_and_styles() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["workExperience"] = [
        {
            **copy.deepcopy(source["workExperience"][1]),
            "years": "2020 - 2021",
            "description": ["Led migrations of services"],
            "descriptionStyles": [],
        },
        {
            **copy.deepcopy(source["workExperience"][0]),
            "years": "2020 - 2021",
            "description": [
                "Built scalable Python APIs",
                "Documented release processes",
            ],
            "descriptionStyles": [],
        },
    ]

    finalized = finalize_ai_resume(source, candidate)

    assert [entry["id"] for entry in finalized["workExperience"]] == [2, 1]
    assert finalized["workExperience"][0]["years"] == "Apr 2020 - Dec 2021"
    assert finalized["workExperience"][0]["descriptionStyles"] == ["bullet"]
    assert finalized["workExperience"][1]["years"] == "Jan 2020 - Mar 2021"
    assert finalized["workExperience"][1]["descriptionStyles"] == ["plain", "bullet"]


def test_reordered_description_rows_remain_confirmable_with_bound_styles() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"] = [
        "Documented release processes",
        "Built scalable Python APIs",
    ]
    candidate["workExperience"][0]["descriptionStyles"] = []

    finalized = finalize_ai_resume(source, candidate)

    assert finalized["workExperience"][0]["descriptionStyles"] == ["bullet", "plain"]
    assert validate_confirmed_resume(source, finalized) == []


def test_missing_model_id_falls_back_to_entry_identity() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate_entry = candidate["workExperience"][0]
    candidate_entry.pop("id")
    candidate_entry["years"] = "2020 - 2021"

    finalized = finalize_ai_resume(source, candidate)

    assert finalized["workExperience"][0]["id"] == 1
    assert finalized["workExperience"][0]["years"] == "Jan 2020 - Mar 2021"


async def test_real_refiner_final_writer_restores_partial_sections() -> None:
    source = _source_resume()
    master = copy.deepcopy(source)
    master["additional"]["technicalSkills"].append("Kubernetes")
    partial = {
        "personalInfo": copy.deepcopy(source["personalInfo"]),
        "summary": "Kubernetes backend engineer.",
    }

    with patch(
        "app.services.refiner.complete_json",
        new_callable=AsyncMock,
        return_value=partial,
    ):
        result = await refine_resume(
            initial_tailored=source,
            master_resume=master,
            job_description="Backend role requiring Kubernetes",
            job_keywords={
                "required_skills": ["Kubernetes"],
                "preferred_skills": [],
                "keywords": [],
            },
            config=RefinementConfig(
                enable_keyword_injection=True,
                enable_ai_phrase_removal=False,
                enable_master_alignment_check=True,
            ),
        )

    assert result.refined_data["summary"] == "Kubernetes backend engineer."
    for section in (
        "workExperience",
        "education",
        "personalProjects",
        "customSections",
    ):
        assert result.refined_data[section] == source[section]


async def test_real_refiner_binds_styles_to_reordered_entry_identity() -> None:
    source = _source_resume()
    master = copy.deepcopy(source)
    master["additional"]["technicalSkills"].append("Kubernetes")
    candidate = copy.deepcopy(source)
    candidate["summary"] = "Kubernetes backend engineer."
    candidate["workExperience"] = [
        {
            **copy.deepcopy(source["workExperience"][1]),
            "description": ["Led migrations of services"],
            "descriptionStyles": [],
        },
        {
            **copy.deepcopy(source["workExperience"][0]),
            "description": ["Built scalable Python APIs", "Documented releases"],
            "descriptionStyles": [],
        },
    ]

    with patch(
        "app.services.refiner.complete_json",
        new_callable=AsyncMock,
        return_value=candidate,
    ):
        result = await refine_resume(
            initial_tailored=source,
            master_resume=master,
            job_description="Backend role requiring Kubernetes",
            job_keywords={
                "required_skills": ["Kubernetes"],
                "preferred_skills": [],
                "keywords": [],
            },
            config=RefinementConfig(
                enable_keyword_injection=True,
                enable_ai_phrase_removal=False,
                enable_master_alignment_check=True,
            ),
        )

    assert [entry["id"] for entry in result.refined_data["workExperience"]] == [
        2,
        1,
    ]
    assert result.refined_data["workExperience"][0]["descriptionStyles"] == ["bullet"]
    assert result.refined_data["workExperience"][1]["descriptionStyles"] == [
        "plain",
        "bullet",
    ]


async def test_restored_unsafe_writer_attempt_is_not_counted_as_applied() -> None:
    source = _source_resume()
    master = copy.deepcopy(source)
    master["additional"]["technicalSkills"].append("Kubernetes")
    partial = {
        "personalInfo": copy.deepcopy(source["personalInfo"]),
        "summary": source["summary"],
    }

    with patch(
        "app.services.refiner.complete_json",
        new_callable=AsyncMock,
        return_value=partial,
    ) as writer:
        result = await refine_resume(
            initial_tailored=source,
            master_resume=master,
            job_description="Backend role requiring Kubernetes",
            job_keywords={"required_skills": ["Kubernetes"]},
            config=RefinementConfig(
                enable_keyword_injection=True,
                enable_ai_phrase_removal=False,
                enable_master_alignment_check=False,
            ),
        )

    assert writer.await_count == 1
    assert result.passes_attempted == 1
    assert result.passes_completed == 0
    assert result.refined_data == source


def test_confirm_validation_allows_reorder_but_rejects_loss_and_identity_drift() -> (
    None
):
    source = _source_resume()
    reordered = copy.deepcopy(source)
    reordered["workExperience"].reverse()
    assert validate_confirmed_resume(source, reordered) == []

    missing = copy.deepcopy(source)
    missing["workExperience"] = []
    assert "workExperience.entries" in validate_confirmed_resume(source, missing)

    mutated = copy.deepcopy(source)
    mutated["workExperience"][0]["company"] = "Moon Base"
    assert "workExperience.identity" in validate_confirmed_resume(source, mutated)

    custom_mutated = copy.deepcopy(source)
    custom_mutated["customSections"]["talks"]["items"][0]["years"] = "2024"
    assert "customSections.talks.identity" in validate_confirmed_resume(
        source, custom_mutated
    )


def test_confirm_accepts_schema_defaults_absent_from_legacy_source() -> None:
    source = _source_resume()
    source["workExperience"][0].pop("id")
    source["workExperience"][0].pop("descriptionStyles")
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["id"] = 0
    candidate["workExperience"][0]["descriptionStyles"] = ["bullet", "bullet"]

    assert validate_confirmed_resume(source, candidate) == []


def test_verified_jd_skill_addition_remains_while_original_lists_are_preserved() -> (
    None
):
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["additional"]["technicalSkills"] = ["Kubernetes"]

    finalized = finalize_ai_resume(source, candidate)

    assert finalized["additional"]["technicalSkills"] == ["Kubernetes", "Python"]
    assert validate_confirmed_resume(source, finalized) == []


def test_new_metrics_require_source_evidence_but_legitimate_rephrasing_remains() -> (
    None
):
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"] = [
        "Built scalable Python APIs",
        "Managed 800 people",
    ]

    finalized = finalize_ai_resume(source, candidate)

    assert (
        finalized["workExperience"][0]["description"][0] == "Built scalable Python APIs"
    )
    assert finalized["workExperience"][0]["description"][1] == "Documented releases"


def test_equivalent_metric_notation_remains_editable() -> None:
    source = _source_resume()
    source["workExperience"][0]["description"][
        0
    ] = "Handled 50K requests with 40% fewer errors"
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"][
        0
    ] = "Handled 50 thousand requests with 40 percent fewer errors"

    finalized = finalize_ai_resume(source, candidate)

    assert finalized["workExperience"][0]["description"][0] == (
        "Handled 50 thousand requests with 40 percent fewer errors"
    )


def test_metric_multiplicity_and_glued_units_are_grounded() -> None:
    source = _source_resume()
    source["workExperience"][0]["description"][0] = "Reduced latency by 10%"
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"][0] = (
        "Reduced 10% latency and added another 10% improvement"
    )
    candidate["workExperience"][0]["description"][1] = "Reduced latency by 5ms"

    finalized = finalize_ai_resume(source, candidate)

    assert finalized["workExperience"][0]["description"] == [
        "Reduced latency by 10%",
        "Documented releases",
    ]


def test_versions_years_and_equivalent_scaled_counts_are_not_novel_metrics() -> None:
    source = _source_resume()
    source["workExperience"][0]["description"][0] = "Served 1,000,000 users"
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"][0] = (
        "Served 1 million users with Python 3.9 in 2021"
    )

    finalized = finalize_ai_resume(source, candidate)

    assert "1 million" in finalized["workExperience"][0]["description"][0]


@pytest.mark.parametrize(
    ("source_row", "candidate_row"),
    [
        ("Migrated 150 servers", "Migrated 2000 servers"),
        ("Managed systems in 150 stores", "Managed systems in 2000 stores"),
    ],
    ids=["plain-count", "count-after-preposition"],
)
def test_count_in_year_range_is_not_mistaken_for_a_date(
    source_row: str,
    candidate_row: str,
) -> None:
    source = _source_resume()
    source["workExperience"][0]["description"][0] = source_row
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"][0] = candidate_row

    finalized = finalize_ai_resume(source, candidate)

    assert finalized["workExperience"][0]["description"][0] == source_row


@pytest.mark.parametrize(
    ("source_row", "candidate_row"),
    [
        (
            "Reduced deployment time",
            "Reduced deployment time by automating release pipelines across EMEA",
        ),
        (
            "Built auth for five services and integrated SSO",
            "Built auth for services",
        ),
    ],
    ids=["unsupported-expansion", "unsupported-truncation"],
)
def test_subset_rewrite_is_restored_or_flagged_for_review(
    source_row: str,
    candidate_row: str,
) -> None:
    source = _source_resume()
    source["workExperience"][0]["description"] = [source_row]
    source["workExperience"][0]["descriptionStyles"] = ["bullet"]
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"] = [candidate_row]

    strict = finalize_ai_resume(source, candidate, allow_review_claims=False)
    preview = finalize_ai_resume(source, candidate, allow_review_claims=True)

    assert strict["workExperience"][0]["description"] == [source_row]
    assert grounding_review_warnings(source, preview) == [
        f"{GROUNDING_REVIEW_CODE}: Review workExperience[0].description[0] against the source resume."
    ]


def test_moderate_grounded_expansion_remains_editable_without_warning() -> None:
    source = _source_resume()
    source["workExperience"][0]["description"] = ["Built Python APIs"]
    source["workExperience"][0]["descriptionStyles"] = ["bullet"]
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"] = ["Built scalable Python APIs"]

    finalized = finalize_ai_resume(source, candidate, allow_review_claims=False)

    assert finalized["workExperience"][0]["description"] == [
        "Built scalable Python APIs"
    ]
    assert grounding_review_warnings(source, finalized) == []


def test_restorable_reordered_metric_consumes_its_matched_source_row() -> None:
    source = _source_resume()
    source["workExperience"][0]["description"] = [
        "Led team of 5 engineers",
        "Built REST API",
        "Reduced costs by 10%",
    ]
    source["workExperience"][0]["descriptionStyles"] = ["bullet"] * 3
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"] = [
        "Reduced costs by 15%",
        "Built REST API",
        "Led team of 5 engineers",
    ]

    finalized = finalize_ai_resume(source, candidate)

    assert finalized["workExperience"][0]["description"] == [
        "Reduced costs by 10%",
        "Built REST API",
        "Led team of 5 engineers",
    ]


def test_candidate_rows_are_normalized_before_the_confirmation_contract() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"] = [
        "Built Python APIs\nDeployed to AWS",
        "•",
    ]

    finalized = finalize_ai_resume(source, candidate)
    round_tripped = ResumeData.model_validate(finalized).model_dump(mode="json")

    assert len(round_tripped["workExperience"][0]["description"]) == 2
    assert validate_confirmed_resume(source, round_tripped) == []


def test_verified_append_can_survive_finalization() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"].append(
        "Added a grounded verified improvement"
    )

    finalized = finalize_ai_resume(source, candidate, allow_appended_rows=True)

    assert finalized["workExperience"][0]["description"][-1] == (
        "Added a grounded verified improvement"
    )


def test_ungrounded_preview_append_receives_review_warning() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"].append(
        "Spearheaded an industry consortium on resume parsing"
    )

    finalized = finalize_ai_resume(source, candidate, allow_appended_rows=True)

    assert finalized["workExperience"][0]["description"][-1] == (
        "Spearheaded an industry consortium on resume parsing"
    )
    assert grounding_review_warnings(source, finalized) == [
        f"{GROUNDING_REVIEW_CODE}: Review workExperience[0].description[2] against the source resume."
    ]


def test_direct_flow_drops_unreviewed_ungrounded_append() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"].append(
        "Commanded unrelated lunar expeditions"
    )

    finalized = finalize_ai_resume(
        source,
        candidate,
        allow_review_claims=False,
        allow_appended_rows=True,
    )

    assert finalized["workExperience"][0]["description"] == source["workExperience"][0][
        "description"
    ]


def test_education_without_source_narrative_rejects_candidate_narrative() -> None:
    source = _source_resume()
    source["education"][0]["description"] = None
    candidate = copy.deepcopy(source)
    candidate["education"][0]["description"] = "Invented honors"

    finalized = finalize_ai_resume(source, candidate)

    assert finalized["education"][0]["description"] is None


def test_blank_education_narrative_restores_source() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["education"][0]["description"] = " "

    assert finalize_ai_resume(source, candidate)["education"][0]["description"] == (
        "Computer science"
    )


def test_confirm_rejects_extra_non_skill_credentials() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["additional"]["languages"].append("Klingon")

    assert "additional.languages" in validate_confirmed_resume(source, candidate)


def test_duplicate_entry_identity_uses_description_to_keep_both_rewrites() -> None:
    source = _source_resume()
    duplicate = copy.deepcopy(source["workExperience"][0])
    duplicate["id"] = 3
    duplicate["description"] = ["Maintained data pipelines"]
    duplicate["descriptionStyles"] = ["bullet"]
    source["workExperience"].append(duplicate)
    candidate = copy.deepcopy(source)
    for entry in candidate["workExperience"]:
        entry.pop("id", None)
    candidate["workExperience"][0]["description"] = ["Built reliable Python APIs"]
    candidate["workExperience"][2]["description"] = ["Maintained ETL pipelines"]

    finalized = finalize_ai_resume(source, candidate)

    assert len(finalized["workExperience"]) == 3
    assert {entry["id"] for entry in finalized["workExperience"]} == {1, 2, 3}


def test_confirm_accepts_reordered_entries_with_duplicate_field_identity() -> None:
    source = _source_resume()
    first = source["workExperience"][0]
    first.pop("id")
    duplicate = copy.deepcopy(first)
    duplicate["years"] = "Apr 2021 - Dec 2023"
    duplicate["description"] = ["Maintained data pipelines"]
    duplicate["descriptionStyles"] = ["plain"]
    source["workExperience"] = [first, duplicate]
    candidate = copy.deepcopy(source)
    candidate["workExperience"].reverse()

    finalized = finalize_ai_resume(source, candidate)

    assert [entry["years"] for entry in finalized["workExperience"]] == [
        "Apr 2021 - Dec 2023",
        "Jan 2020 - Mar 2021",
    ]
    assert validate_confirmed_resume(source, finalized) == []


async def test_refiner_rolls_back_malformed_nested_writer_output() -> None:
    source = _source_resume()
    master = copy.deepcopy(source)
    master["additional"]["technicalSkills"].append("Kubernetes")
    malformed = copy.deepcopy(source)
    malformed["additional"]["languages"] = None

    with patch(
        "app.services.refiner.complete_json",
        new_callable=AsyncMock,
        return_value=malformed,
    ):
        result = await refine_resume(
            source,
            master,
            "Kubernetes role",
            {"required_skills": ["Kubernetes"]},
            RefinementConfig(
                enable_keyword_injection=True,
                enable_ai_phrase_removal=False,
                enable_master_alignment_check=False,
            ),
        )

    assert result.refined_data == source


def test_ats_score_uses_post_preservation_resume_match() -> None:
    ats_payload = {
        "overall_score": 25.0,
        "sub_scores": {
            "keyword_match": 25.0,
            "experience_alignment": 0.0,
            "skills_coverage": 0.0,
            "education_fit": 0.0,
            "format_quality": 0.0,
        },
        "missing_keywords": [],
        "injectable_keywords": [],
        "recommendations": [],
    }
    with (
        patch("app.routers.resumes.calculate_keyword_match", return_value=25.0),
        patch("app.routers.resumes.compute_ats_score", return_value=ats_payload) as score,
    ):
        resumes._build_ats_score(
            {"summary": "Finalized"},
            {"keywords": ["Python"]},
            SimpleNamespace(
                final_match_percentage=99.0,
                keyword_analysis=None,
            ),
            True,
        )

    assert score.call_args.kwargs["keyword_match_percentage"] == 25.0


def test_weakly_grounded_narrative_gets_stable_review_warning() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["workExperience"][0]["description"][0] = "Owned moon missions"

    warnings = grounding_review_warnings(source, candidate)

    assert warnings == [
        f"{GROUNDING_REVIEW_CODE}: Review workExperience[0].description[0] against the source resume."
    ]


def test_custom_item_claims_use_the_same_grounding_policy() -> None:
    source = _source_resume()
    candidate = copy.deepcopy(source)
    candidate["customSections"]["talks"]["items"][0]["description"][
        0
    ] = "Commanded lunar expeditions"

    warnings = grounding_review_warnings(source, candidate)

    assert warnings == [
        f"{GROUNDING_REVIEW_CODE}: Review customSections.talks.items[0].description[0] against the source resume."
    ]


def test_date_restoration_matches_same_year_roles_by_context() -> None:
    parsed = {
        "workExperience": [
            {"title": "Engineer", "company": "Alpha", "years": "2020 - 2021"},
            {"title": "Lead", "company": "Beta", "years": "2020 - 2021"},
        ]
    }
    markdown = """## Experience
Engineer — Alpha | Jan 2020 - Mar 2021
Lead — Beta | Apr 2020 - Dec 2021
"""

    result = restore_dates_from_markdown(parsed, markdown)

    assert result["workExperience"][0]["years"] == "Jan 2020 - Mar 2021"
    assert result["workExperience"][1]["years"] == "Apr 2020 - Dec 2021"


def test_date_restoration_uses_nearby_identity_for_date_only_lines() -> None:
    parsed = {
        "workExperience": [
            {"title": "Engineer", "company": "Alpha", "years": "2020 - 2021"},
            {"title": "Lead", "company": "Beta", "years": "2020 - 2021"},
        ]
    }
    markdown = """Engineer — Alpha
Jan 2020 - Mar 2021
Lead — Beta
Apr 2020 - Dec 2021
"""

    result = restore_dates_from_markdown(parsed, markdown)

    assert result["workExperience"][0]["years"] == "Jan 2020 - Mar 2021"
    assert result["workExperience"][1]["years"] == "Apr 2020 - Dec 2021"


def test_date_restoration_preserves_ambiguous_collision() -> None:
    parsed = {"workExperience": [{"title": "Engineer", "years": "2020 - 2021"}]}
    markdown = "Jan 2020 - Mar 2021\nApr 2020 - Dec 2021"

    result = restore_dates_from_markdown(parsed, markdown)

    assert result["workExperience"][0]["years"] == "2020 - 2021"


def test_date_restoration_handles_present_current_and_cross_section_context() -> None:
    parsed = {
        "workExperience": [
            {"company": "Alpha", "title": "Engineer", "years": "2021 - Present"}
        ],
        "personalProjects": [
            {"name": "Parser", "role": "Maintainer", "years": "2021 - Present"}
        ],
    }
    markdown = """Engineer — Alpha | Jan 2021 - Current
Parser — Maintainer | May 2021 - Present
"""

    result = restore_dates_from_markdown(parsed, markdown)

    assert result["workExperience"][0]["years"] == "Jan 2021 - Current"
    assert result["personalProjects"][0]["years"] == "May 2021 - Present"


def test_full_month_name_is_already_precise() -> None:
    parsed = {
        "workExperience": [
            {"company": "Alpha", "title": "Engineer", "years": "January 2020 - Current"}
        ]
    }

    result = restore_dates_from_markdown(parsed, "Alpha | Feb 2020 - Present")

    assert result["workExperience"][0]["years"] == "January 2020 - Current"


def test_single_occurrence_requires_matching_identity_across_sections() -> None:
    parsed = {
        "workExperience": [
            {
                "company": "Example University",
                "title": "Research Intern",
                "years": "2020 - 2021",
            }
        ],
        "education": [
            {
                "institution": "Example University",
                "degree": "BSc",
                "years": "2020 - 2021",
            }
        ],
    }
    markdown = "## Education\nExample University — BSc\nJan 2020 - Dec 2021"

    result = restore_dates_from_markdown(parsed, markdown)

    assert result["workExperience"][0]["years"] == "2020 - 2021"
    assert result["education"][0]["years"] == "Jan 2020 - Dec 2021"


def test_single_year_range_and_wide_normalized_context_restore() -> None:
    parsed = {
        "workExperience": [
            {"company": "Alpha Labs", "title": "Engineer", "years": "2020"}
        ]
    }
    markdown = """Engineer  —  Alpha Labs
- Built APIs
- Shipped services
- Mentored peers
Jan 2020 - Dec 2020
"""

    result = restore_dates_from_markdown(parsed, markdown)

    assert result["workExperience"][0]["years"] == "Jan 2020 - Dec 2020"
