"""Unit tests for the deterministic ATS score breakdown (app/services/ats.py)."""

import copy
from typing import Any

import pytest

from app.services.ats import (
    WEIGHTS,
    compute_ats_score,
    compute_date_consistency,
    compute_section_completeness,
    compute_title_match,
)

BASE_RESUME: dict[str, Any] = {
    "personalInfo": {
        "name": "Jane Doe",
        "title": "Senior Product Manager",
        "email": "jane@example.com",
        "phone": "+1 555 0100",
    },
    "summary": "Product leader with 8 years of experience shipping B2B SaaS.",
    "workExperience": [
        {"title": "Product Manager", "company": "Acme", "years": "Jan 2020 - Present"},
        {"title": "Associate PM", "company": "Beta", "years": "Mar 2017 - Dec 2019"},
    ],
    "education": [
        {"institution": "State U", "degree": "BSc", "years": "Sep 2012 - Jun 2016"}
    ],
    "additional": {"technicalSkills": ["SQL", "Jira"]},
}

JOB: dict[str, Any] = {
    "role": "Senior Product Manager",
    "required_skills": ["SQL", "Jira"],
    "preferred_skills": [],
    "keywords": [],
}


def _resume(**overrides: Any) -> dict[str, Any]:
    data = copy.deepcopy(BASE_RESUME)
    data.update(overrides)
    return data


class TestTitleMatch:
    def test_exact_title_in_headline_scores_full(self) -> None:
        assert compute_title_match(_resume(), JOB) == 100.0

    def test_title_match_is_case_insensitive(self) -> None:
        resume = _resume(
            personalInfo={
                **BASE_RESUME["personalInfo"],
                "title": "senior product manager",
            }
        )
        assert compute_title_match(resume, JOB) == 100.0

    def test_exact_title_only_in_summary_scores_partial(self) -> None:
        resume = _resume(
            personalInfo={**BASE_RESUME["personalInfo"], "title": "Product Lead"},
            summary="Senior Product Manager with 8 years in SaaS.",
        )
        assert compute_title_match(resume, JOB) == 75.0

    def test_synonym_title_scores_by_word_overlap_only(self) -> None:
        # "Head of Product Strategy" shares only "product" with the posting title.
        resume = _resume(
            personalInfo={
                **BASE_RESUME["personalInfo"],
                "title": "Head of Product Strategy",
            },
            summary="Leader shipping B2B SaaS.",
        )
        score = compute_title_match(resume, JOB)
        assert score is not None
        assert 0 < score < 50

    def test_no_overlap_scores_zero(self) -> None:
        resume = _resume(
            personalInfo={**BASE_RESUME["personalInfo"], "title": "Data Engineer"},
            summary="Builds pipelines.",
        )
        assert compute_title_match(resume, JOB) == 0.0

    def test_title_is_whole_word_not_substring(self) -> None:
        job = {**JOB, "role": "Engineer"}
        resume = _resume(
            personalInfo={**BASE_RESUME["personalInfo"], "title": "Reengineering Lead"},
            summary="",
        )
        assert compute_title_match(resume, job) == 0.0

    def test_hidden_summary_does_not_count(self) -> None:
        resume = _resume(
            personalInfo={**BASE_RESUME["personalInfo"], "title": "Product Lead"},
            summary="Senior Product Manager with 8 years in SaaS.",
            sectionMeta=[{"id": "summary", "key": "summary", "isVisible": False}],
        )
        score = compute_title_match(resume, JOB)
        assert score is not None and score < 75.0

    @pytest.mark.parametrize("role", [None, "", "   "])
    def test_missing_job_title_is_not_scored(self, role: str | None) -> None:
        assert compute_title_match(_resume(), {**JOB, "role": role}) is None


class TestDateConsistency:
    def test_single_format_scores_full(self) -> None:
        assert compute_date_consistency(_resume()) == 100.0

    def test_mixed_formats_are_penalised(self) -> None:
        resume = _resume(
            workExperience=[
                {"title": "PM", "years": "Jan 2019 - Present"},
                {"title": "APM", "years": "2016-03 - 2018-12"},
            ],
            education=[{"degree": "BSc", "years": "2012 - 2016"}],
        )
        score = compute_date_consistency(resume)
        assert score is not None
        # Jan 2019 (month name) | 2016-03, 2018-12 (ISO) | 2012, 2016 (year only):
        # the dominant style covers 2 of 5 dates.
        assert score == pytest.approx(40.0)

    def test_non_english_month_names_count_as_one_style(self) -> None:
        resume = _resume(
            workExperience=[
                {"title": "PM", "years": "Ene 2020 - Actual"},
                {"title": "APM", "years": "Mar 2017 - Dic 2019"},
            ],
            education=[{"degree": "Grado", "years": "Sep 2012 - Jun 2016"}],
        )
        assert compute_date_consistency(resume) == 100.0

    def test_present_markers_are_ignored(self) -> None:
        resume = _resume(
            workExperience=[{"title": "PM", "years": "2020 - Present"}],
            education=[{"degree": "BSc", "years": "2012 - 2016"}],
        )
        assert compute_date_consistency(resume) == 100.0

    def test_includes_projects_and_custom_sections(self) -> None:
        resume = _resume(
            personalProjects=[{"name": "Tool", "years": "2021"}],
            customSections={
                "volunteering": {
                    "sectionType": "itemList",
                    "items": [{"title": "Mentor", "years": "2022"}],
                }
            },
        )
        score = compute_date_consistency(resume)
        assert score is not None and score < 100.0

    def test_hidden_section_dates_are_ignored(self) -> None:
        resume = _resume(
            education=[{"degree": "BSc", "years": "2012 - 2016"}],
            sectionMeta=[{"id": "education", "key": "education", "isVisible": False}],
        )
        assert compute_date_consistency(resume) == 100.0

    def test_hidden_custom_section_dates_are_ignored(self) -> None:
        resume = _resume(
            customSections={
                "volunteering": {
                    "sectionType": "itemList",
                    "items": [{"title": "Mentor", "years": "2022"}],
                }
            },
            sectionMeta=[{"id": "v", "key": "volunteering", "isVisible": False}],
        )
        assert compute_date_consistency(resume) == 100.0

    def test_month_first_dashed_dates_are_their_own_style(self) -> None:
        only_dashed = _resume(
            workExperience=[{"title": "PM", "years": "09-2021 - 03-2023"}],
            education=[{"degree": "BSc", "years": "09-2015 - 06-2019"}],
        )
        assert compute_date_consistency(only_dashed) == 100.0
        mixed = _resume(
            workExperience=[{"title": "PM", "years": "09-2021 - 03-2023"}],
            education=[{"degree": "BSc", "years": "2015 - 2019"}],
        )
        assert compute_date_consistency(mixed) == 50.0

    def test_fewer_than_two_dates_is_not_scored(self) -> None:
        resume = _resume(
            workExperience=[{"title": "PM", "years": "Jan 2020 - Present"}],
            education=[],
        )
        assert compute_date_consistency(resume) is None


class TestSectionCompleteness:
    def test_complete_resume_scores_full(self) -> None:
        assert compute_section_completeness(_resume()) == 100.0

    def test_missing_contact_info_lowers_score(self) -> None:
        resume = _resume(
            personalInfo={"name": "Jane", "title": "PM", "email": "", "phone": ""}
        )
        assert compute_section_completeness(resume) == 80.0

    def test_hidden_section_does_not_count(self) -> None:
        resume = _resume(
            sectionMeta=[
                {"id": "workExperience", "key": "workExperience", "isVisible": False},
            ]
        )
        assert compute_section_completeness(resume) == 80.0

    def test_unstructured_resume_with_all_headings_scores_full(self) -> None:
        legacy = {
            "content": "Summary ... Work Experience ... Education ... Technical Skills ..."
        }
        assert compute_section_completeness(legacy) == 100.0

    def test_unstructured_resume_with_contact_still_scans_headings(self) -> None:
        legacy = {
            "personalInfo": {"email": "a@x.io"},
            "content": "Summary ... Work Experience ... Education ... Technical Skills ...",
        }
        assert compute_section_completeness(legacy) == 100.0

    def test_section_labels_are_not_counted_as_content(self) -> None:
        # Default sectionMeta carries "Summary", "Experience", ... as display names;
        # a resume with only contact info must not score full completeness.
        empty = {
            "personalInfo": {"email": "a@x.io"},
            "summary": "",
            "workExperience": [],
            "sectionMeta": [
                {"key": "summary", "displayName": "Summary"},
                {"key": "workExperience", "displayName": "Experience"},
                {"key": "education", "displayName": "Education"},
                {"key": "additional", "displayName": "Skills & Awards"},
            ],
        }
        assert compute_section_completeness(empty) == 20.0

    def test_visible_section_meta_still_counts(self) -> None:
        resume = _resume(
            sectionMeta=[
                {"id": "workExperience", "key": "workExperience", "isVisible": True}
            ]
        )
        assert compute_section_completeness(resume) == 100.0


class TestComputeAtsScore:
    def test_weights_sum_to_one(self) -> None:
        assert sum(WEIGHTS.values()) == pytest.approx(1.0)

    def test_all_sub_scores_reported(self) -> None:
        result = compute_ats_score(_resume(), JOB, 100.0, [], [])
        assert set(result["sub_scores"]) == set(WEIGHTS)
        assert result["overall_score"] == 100.0

    def test_title_mismatch_lowers_overall_and_adds_tip(self) -> None:
        resume = _resume(
            personalInfo={**BASE_RESUME["personalInfo"], "title": "Data Engineer"},
            summary="Builds pipelines.",
        )
        result = compute_ats_score(resume, JOB, 100.0, [], [])
        assert result["sub_scores"]["title_match"] == 0.0
        assert result["overall_score"] == pytest.approx(
            100 - WEIGHTS["title_match"] * 100
        )
        assert any("Senior Product Manager" in tip for tip in result["recommendations"])

    def test_unscorable_components_are_excluded_from_overall(self) -> None:
        resume = _resume(workExperience=[], education=[])  # no dates
        job = {**JOB, "role": ""}  # no title
        result = compute_ats_score(resume, job, 50.0, [], [])
        assert result["sub_scores"]["title_match"] is None
        assert result["sub_scores"]["date_consistency"] is None
        sk = result["sub_scores"]["skills_coverage"]
        sec = result["sub_scores"]["section_completeness"]
        expected = (
            50.0 * WEIGHTS["keyword_match"]
            + sk * WEIGHTS["skills_coverage"]
            + sec * WEIGHTS["section_completeness"]
        ) / (
            WEIGHTS["keyword_match"]
            + WEIGHTS["skills_coverage"]
            + WEIGHTS["section_completeness"]
        )
        assert result["overall_score"] == pytest.approx(round(expected, 1))

    def test_mixed_dates_add_tip(self) -> None:
        resume = _resume(
            workExperience=[
                {"title": "PM", "years": "Jan 2019 - Present"},
                {"title": "APM", "years": "2016 - 2018"},
            ]
        )
        result = compute_ats_score(resume, JOB, 100.0, [], [])
        assert any("date" in tip.lower() for tip in result["recommendations"])


def test_keyword_lists_follow_job_posting_order() -> None:
    job = {
        **JOB,
        "required_skills": ["Kubernetes", "Terraform"],
        "preferred_skills": ["Go"],
        "keywords": ["gRPC"],
    }
    result = compute_ats_score(
        _resume(), job, 50.0, ["gRPC", "Go", "Terraform"], ["Kubernetes"]
    )
    assert result["missing_keywords"] == ["Terraform", "Go", "gRPC"]
