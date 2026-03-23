"""Unit tests for refiner pure functions — no LLM calls needed."""

import copy
import pytest

from app.services.refiner import (
    analyze_keyword_gaps,
    calculate_keyword_match,
    fix_alignment_violations,
    remove_ai_phrases,
    validate_master_alignment,
)
from app.schemas.refinement import AlignmentViolation


class TestRemoveAiPhrases:
    """Tests for remove_ai_phrases() — local regex replacement."""

    def test_removes_blacklisted_verbs(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["workExperience"][0]["description"][0] = "Spearheaded REST API development"
        cleaned, removed = remove_ai_phrases(data)
        assert "spearheaded" in [r.lower() for r in removed]
        assert "spearheaded" not in cleaned["workExperience"][0]["description"][0].lower()

    def test_removes_buzzwords(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["summary"] = "Leveraged cutting-edge technologies to build robust solutions"
        cleaned, removed = remove_ai_phrases(data)
        removed_lower = [r.lower() for r in removed]
        assert "leveraged" in removed_lower
        assert "cutting-edge" in removed_lower

    def test_protects_jd_phrases(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["summary"] = "Built robust microservices"
        # "robust" is in the blacklist, but if it's in JD, it should be protected
        cleaned, removed = remove_ai_phrases(data, job_description="We need robust solutions")
        assert "robust" not in [r.lower() for r in removed]

    def test_replaces_with_alternatives(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["workExperience"][0]["description"][0] = "Utilized Python for API development"
        cleaned, removed = remove_ai_phrases(data)
        # "utilized" → "used"
        assert "used" in cleaned["workExperience"][0]["description"][0].lower()

    def test_removes_em_dashes(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["summary"] = "Built APIs \u2014 serving thousands of users"
        cleaned, removed = remove_ai_phrases(data)
        assert "\u2014" not in cleaned["summary"]

    def test_no_removal_when_already_clean(self):
        """A resume with no blacklisted terms should have zero removals."""
        clean_data = {
            "summary": "Built APIs with Python.",
            "workExperience": [{"description": ["Wrote code and shipped features"]}],
        }
        cleaned, removed = remove_ai_phrases(clean_data)
        assert len(removed) == 0

    def test_does_not_mutate_input(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["summary"] = "Spearheaded development"
        data_before = copy.deepcopy(data)
        remove_ai_phrases(data)
        # The input dict should not be mutated by remove_ai_phrases
        assert data == data_before


class TestValidateMasterAlignment:
    """Tests for validate_master_alignment() — fabrication detection."""

    def test_aligned_when_identical(self, sample_resume, master_resume):
        report = validate_master_alignment(sample_resume, master_resume)
        assert report.is_aligned is True
        assert len(report.violations) == 0

    def test_detects_fabricated_skill(self, sample_resume, master_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["technicalSkills"].append("Kubernetes")
        report = validate_master_alignment(tailored, master_resume)
        skill_violations = [v for v in report.violations if "skill" in v.violation_type]
        assert len(skill_violations) >= 1
        assert any("kubernetes" in v.value.lower() for v in skill_violations)

    def test_detects_fabricated_certification(self, sample_resume, master_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["certificationsTraining"].append("Google Cloud Professional")
        report = validate_master_alignment(tailored, master_resume)
        cert_violations = [v for v in report.violations if v.violation_type == "fabricated_cert"]
        assert len(cert_violations) >= 1

    def test_detects_fabricated_company(self, sample_resume, master_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["workExperience"].append({
            "id": 3,
            "title": "Engineer",
            "company": "FakeCompany Inc",
            "years": "2015 - 2017",
            "description": ["Did things"],
        })
        report = validate_master_alignment(tailored, master_resume)
        company_violations = [v for v in report.violations if v.violation_type == "fabricated_company"]
        assert len(company_violations) >= 1

    def test_allows_skill_variants_as_non_critical(self, sample_resume, master_resume):
        """A variant of an existing skill (e.g. 'Python 3') should be info, not critical."""
        tailored = copy.deepcopy(sample_resume)
        # Master has "Python", tailored adds "Python 3" — substring match should be non-critical
        tailored["additional"]["technicalSkills"].append("Python 3")
        report = validate_master_alignment(tailored, master_resume)
        python3_violations = [
            v for v in report.violations
            if "python 3" in v.value.lower()
        ]
        # Should be info/variant, NOT critical fabricated_skill
        for v in python3_violations:
            assert v.severity != "critical" or v.violation_type == "skill_variant"

    def test_confidence_decreases_with_violations(self, sample_resume, master_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["technicalSkills"].extend(["Kotlin", "Scala", "Haskell"])
        report = validate_master_alignment(tailored, master_resume)
        assert report.confidence_score < 1.0


class TestFixAlignmentViolations:
    """Tests for fix_alignment_violations() — removing fabricated content."""

    def test_removes_fabricated_skill(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["technicalSkills"].append("FakeSkill")
        violations = [
            AlignmentViolation(
                field_path="additional.technicalSkills",
                violation_type="fabricated_skill",
                value="FakeSkill",
                severity="critical",
            )
        ]
        fixed = fix_alignment_violations(tailored, violations)
        assert "FakeSkill" not in fixed["additional"]["technicalSkills"]

    def test_removes_fabricated_cert(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["certificationsTraining"].append("Fake Cert")
        violations = [
            AlignmentViolation(
                field_path="additional.certificationsTraining",
                violation_type="fabricated_cert",
                value="Fake Cert",
                severity="critical",
            )
        ]
        fixed = fix_alignment_violations(tailored, violations)
        assert "Fake Cert" not in fixed["additional"]["certificationsTraining"]

    def test_skips_non_critical_violations(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        original_skills = list(tailored["additional"]["technicalSkills"])
        violations = [
            AlignmentViolation(
                field_path="additional.technicalSkills",
                violation_type="skill_variant",
                value="Python",
                severity="info",
            )
        ]
        fixed = fix_alignment_violations(tailored, violations)
        assert fixed["additional"]["technicalSkills"] == original_skills


class TestAnalyzeKeywordGaps:
    """Tests for analyze_keyword_gaps() — keyword matching analysis."""

    def test_finds_missing_keywords(self, sample_resume, master_resume, sample_job_keywords):
        analysis = analyze_keyword_gaps(sample_job_keywords, sample_resume, master_resume)
        # "Kubernetes" is in required_skills but not in the resume
        assert "Kubernetes" in analysis.missing_keywords

    def test_identifies_injectable_vs_non_injectable(self, sample_resume, master_resume, sample_job_keywords):
        analysis = analyze_keyword_gaps(sample_job_keywords, sample_resume, master_resume)
        # Every keyword lands in exactly one bucket
        all_jd = set(sample_job_keywords["required_skills"] + sample_job_keywords["preferred_skills"] + sample_job_keywords["keywords"])
        present = all_jd - set(analysis.missing_keywords)
        injectable = set(analysis.injectable_keywords)
        non_injectable = set(analysis.non_injectable_keywords)
        # Missing = injectable + non-injectable (no overlap)
        assert injectable | non_injectable == set(analysis.missing_keywords)
        assert injectable & non_injectable == set()
        # Present + missing = all keywords
        assert present | set(analysis.missing_keywords) == all_jd

    def test_calculates_match_percentage(self, sample_resume, master_resume, sample_job_keywords):
        analysis = analyze_keyword_gaps(sample_job_keywords, sample_resume, master_resume)
        assert 0.0 <= analysis.current_match_percentage <= 100.0
        assert analysis.potential_match_percentage >= analysis.current_match_percentage

    def test_keyword_already_present(self, sample_resume, master_resume):
        keywords = {"required_skills": ["Python"], "preferred_skills": [], "keywords": []}
        analysis = analyze_keyword_gaps(keywords, sample_resume, master_resume)
        assert "Python" not in analysis.missing_keywords
        assert analysis.current_match_percentage == 100.0


class TestCalculateKeywordMatch:
    """Tests for calculate_keyword_match() — percentage calculation."""

    def test_returns_percentage(self, sample_resume, sample_job_keywords):
        pct = calculate_keyword_match(sample_resume, sample_job_keywords)
        assert 0.0 <= pct <= 100.0

    def test_returns_zero_for_no_keywords(self, sample_resume):
        pct = calculate_keyword_match(sample_resume, {"required_skills": [], "preferred_skills": [], "keywords": []})
        assert pct == 0.0

    def test_returns_100_when_all_present(self, sample_resume):
        # Use keywords that are definitely in the resume
        keywords = {"required_skills": ["Python", "FastAPI"], "preferred_skills": [], "keywords": []}
        pct = calculate_keyword_match(sample_resume, keywords)
        assert pct == 100.0

    def test_word_boundary_matching(self, sample_resume):
        """'Go' should not match 'Google' or 'going'."""
        keywords = {"required_skills": ["Go"], "preferred_skills": [], "keywords": []}
        pct = calculate_keyword_match(sample_resume, keywords)
        # "Go" is not in the sample resume as a standalone word
        assert pct == 0.0
