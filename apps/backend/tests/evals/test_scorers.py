"""Deterministic tests for the structural scorers.

This is the anti-theater proof for the eval harness: every scorer is exercised
with BOTH a known-good and a known-bad input, so we know it actually detects
violations instead of always returning "OK". None of these tests touch an LLM
or the network — they run for free in the normal suite.

The ``tailored_good`` / ``tailored_bad`` golden fixtures double as realistic
end-to-end checks: the good tailoring must pass every scorer, the bad one must
trip the relevant scorers.
"""

import copy

import pytest

from tests.evals.golden.cases import GOLDEN_CASES
from tests.evals.scorers import (
    flatten_resume_text,
    is_valid_resume,
    jd_keywords_present,
    no_fabricated_employers,
    personal_info_unchanged,
    sections_preserved,
)


class TestSectionsPreserved:
    def test_identical_resume_preserves_all_sections(self, sample_resume):
        assert sections_preserved(sample_resume, sample_resume) is True

    def test_dropping_work_experience_fails(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["workExperience"] = []
        assert sections_preserved(sample_resume, tailored) is False

    def test_dropping_education_fails(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        del tailored["education"]
        assert sections_preserved(sample_resume, tailored) is False

    def test_emptying_summary_fails(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["summary"] = "   "
        assert sections_preserved(sample_resume, tailored) is False

    def test_originally_empty_section_is_not_required(self, sample_resume):
        original = copy.deepcopy(sample_resume)
        original["personalProjects"] = []
        tailored = copy.deepcopy(original)
        # personalProjects was empty to begin with, so staying empty is fine.
        assert sections_preserved(original, tailored) is True

    def test_rewording_bullets_still_preserves_sections(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["workExperience"][0]["description"] = ["Completely reworded bullet"]
        assert sections_preserved(sample_resume, tailored) is True


class TestNoFabricatedEmployers:
    def test_same_employers_returns_empty_list(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        assert no_fabricated_employers(sample_resume, tailored) == []

    def test_reworded_bullets_same_companies_is_truthful(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        for exp in tailored["workExperience"]:
            exp["description"] = ["reworded for the JD"]
        assert no_fabricated_employers(sample_resume, tailored) == []

    def test_invented_company_is_detected(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["workExperience"].append(
            {
                "id": 99,
                "title": "Principal Engineer",
                "company": "Globex Industries",
                "years": "2015 - Present",
                "description": ["never happened"],
            }
        )
        fabricated = no_fabricated_employers(sample_resume, tailored)
        assert fabricated == ["Globex Industries"]

    def test_case_and_whitespace_insensitive(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["workExperience"][0]["company"] = "  acme corp  "
        # Same employer, different casing/whitespace — not a fabrication.
        assert no_fabricated_employers(sample_resume, tailored) == []

    def test_each_fabricated_employer_listed_once(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["workExperience"] = [
            {"company": "Globex Industries", "title": "x", "years": "y"},
            {"company": "Globex Industries", "title": "z", "years": "w"},
        ]
        assert no_fabricated_employers(sample_resume, tailored) == ["Globex Industries"]


class TestJdKeywordsPresent:
    def test_all_keywords_present_scores_one(self, sample_resume):
        keywords = ["Python", "FastAPI", "Docker", "AWS"]
        assert jd_keywords_present(sample_resume, keywords) == 1.0

    def test_no_keywords_present_scores_zero(self, sample_resume):
        keywords = ["Rust", "Kubernetes", "Elixir", "COBOL"]
        assert jd_keywords_present(sample_resume, keywords) == 0.0

    def test_partial_match_is_fractional(self, sample_resume):
        # 2 of 4 present.
        keywords = ["Python", "FastAPI", "Rust", "Elixir"]
        assert jd_keywords_present(sample_resume, keywords) == pytest.approx(0.5)

    def test_match_is_case_insensitive(self, sample_resume):
        assert jd_keywords_present(sample_resume, ["python", "fastapi"]) == 1.0

    def test_empty_keyword_list_scores_one(self, sample_resume):
        assert jd_keywords_present(sample_resume, []) == 1.0

    def test_searches_nested_fields(self, sample_resume):
        # "microservices" only appears inside a work-experience bullet.
        assert jd_keywords_present(sample_resume, ["microservices"]) == 1.0


class TestIsValidResume:
    def test_well_formed_resume_is_valid(self, sample_resume):
        assert is_valid_resume(sample_resume) is True

    def test_empty_dict_is_valid_due_to_defaults(self):
        # Every ResumeData field has a default, so {} is a valid (empty) resume.
        assert is_valid_resume({}) is True

    def test_wrong_type_for_work_experience_is_invalid(self, sample_resume):
        broken = copy.deepcopy(sample_resume)
        broken["workExperience"] = "not a list"
        assert is_valid_resume(broken) is False

    def test_wrong_type_for_personal_info_is_invalid(self, sample_resume):
        broken = copy.deepcopy(sample_resume)
        broken["personalInfo"] = "nope"
        assert is_valid_resume(broken) is False


class TestPersonalInfoUnchanged:
    def test_identical_personal_info_is_unchanged(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        assert personal_info_unchanged(sample_resume, tailored) is True

    def test_changed_name_is_flagged(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["personalInfo"]["name"] = "Someone Else"
        assert personal_info_unchanged(sample_resume, tailored) is False

    def test_changed_email_is_flagged(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["personalInfo"]["email"] = "attacker@example.com"
        assert personal_info_unchanged(sample_resume, tailored) is False

    def test_editing_other_sections_does_not_trip_it(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["summary"] = "totally different summary"
        assert personal_info_unchanged(sample_resume, tailored) is True


class TestFlattenResumeText:
    def test_includes_nested_bullet_text(self, sample_resume):
        text = flatten_resume_text(sample_resume)
        assert "rest apis" in text
        assert "jane doe" in text

    def test_output_is_lowercased(self, sample_resume):
        text = flatten_resume_text(sample_resume)
        assert text == text.lower()


class TestGoldenCasesStructural:
    """The golden good/bad tailorings must score exactly as designed."""

    @pytest.mark.parametrize("case", GOLDEN_CASES, ids=lambda c: c["name"])
    def test_good_tailoring_passes_every_scorer(self, case):
        original = case["original"]
        good = case["tailored_good"]
        assert is_valid_resume(original) is True
        assert is_valid_resume(good) is True
        assert sections_preserved(original, good) is True
        assert no_fabricated_employers(original, good) == []
        assert personal_info_unchanged(original, good) is True
        assert jd_keywords_present(good, case["jd_keywords"]) == 1.0

    @pytest.mark.parametrize("case", GOLDEN_CASES, ids=lambda c: c["name"])
    def test_bad_tailoring_is_caught(self, case):
        original = case["original"]
        bad = case["tailored_bad"]
        # The bad fixture violates at least one truthfulness/preservation rule:
        # it drops a section, invents an employer, OR rewrites the identity.
        violated = (
            not sections_preserved(original, bad)
            or bool(no_fabricated_employers(original, bad))
            or not personal_info_unchanged(original, bad)
        )
        assert violated is True
        # Specifically, every bad fixture fabricates an employer and changes
        # the candidate's name.
        assert no_fabricated_employers(original, bad) != []
        assert personal_info_unchanged(original, bad) is False
