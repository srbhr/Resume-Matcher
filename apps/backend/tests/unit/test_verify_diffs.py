"""Unit tests for verify_diff_result() — local quality checks."""

import copy
import pytest

from app.schemas.models import ResumeChange
from app.services.improver import verify_diff_result


class TestVerifyNoWarnings:
    """Tests that pass cleanly with no warnings."""

    def test_clean_result_no_warnings(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["summary"] = "Updated summary."
        applied = [
            ResumeChange(
                path="summary",
                action="replace",
                original=sample_resume["summary"],
                value="Updated summary.",
                reason="test",
            )
        ]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        assert len(warnings) == 0


class TestVerifyEmptyChanges:
    """Check 1: No changes applied."""

    def test_warns_on_empty_applied_changes(self, sample_resume, sample_job_keywords):
        warnings = verify_diff_result(sample_resume, sample_resume, [], sample_job_keywords)
        assert len(warnings) == 1
        assert "no changes" in warnings[0].lower()

    def test_returns_early_on_empty(self, sample_resume, sample_job_keywords):
        """When no changes applied, skip other checks."""
        warnings = verify_diff_result(sample_resume, sample_resume, [], sample_job_keywords)
        # Should only have the "no changes" warning, not section count etc.
        assert len(warnings) == 1


class TestVerifySectionCounts:
    """Check 2: Section counts preserved."""

    def test_warns_on_dropped_work_experience(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["workExperience"] = result["workExperience"][:1]  # Drop one
        applied = [ResumeChange(path="summary", action="replace", original="x", value="y", reason="z")]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        assert any("work experience" in w.lower() for w in warnings)

    def test_warns_on_dropped_education(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["education"] = []
        applied = [ResumeChange(path="summary", action="replace", original="x", value="y", reason="z")]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        assert any("education" in w.lower() for w in warnings)

    def test_warns_on_dropped_projects(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["personalProjects"] = []
        applied = [ResumeChange(path="summary", action="replace", original="x", value="y", reason="z")]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        assert any("project" in w.lower() for w in warnings)

    def test_no_warning_when_counts_match(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["summary"] = "Changed."
        applied = [ResumeChange(path="summary", action="replace", original="x", value="Changed.", reason="z")]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        section_warnings = [w for w in warnings if "section count" in w.lower()]
        assert len(section_warnings) == 0


class TestVerifyIdentityFields:
    """Check 3: Identity fields unchanged."""

    def test_warns_on_company_change(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["workExperience"][0]["company"] = "Different Corp"
        applied = [ResumeChange(path="summary", action="replace", original="x", value="y", reason="z")]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        assert any("company" in w.lower() or "identity" in w.lower() for w in warnings)

    def test_warns_on_title_change(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["workExperience"][0]["title"] = "VP of Engineering"
        applied = [ResumeChange(path="summary", action="replace", original="x", value="y", reason="z")]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        assert any("title" in w.lower() or "identity" in w.lower() for w in warnings)

    def test_warns_on_institution_change(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["education"][0]["institution"] = "Stanford"
        applied = [ResumeChange(path="summary", action="replace", original="x", value="y", reason="z")]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        assert any("institution" in w.lower() or "identity" in w.lower() for w in warnings)


class TestVerifyWordCount:
    """Check 4: Word count ratio."""

    def test_warns_on_word_count_explosion(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        # Make descriptions very long
        long_text = "word " * 200
        result["workExperience"][0]["description"] = [long_text] * 5
        result["workExperience"][1]["description"] = [long_text] * 5
        applied = [ResumeChange(path="summary", action="replace", original="x", value="y", reason="z")]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        assert any("word count" in w.lower() for w in warnings)

    def test_no_warning_on_normal_growth(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        # Add one bullet — modest growth
        result["workExperience"][0]["description"].append("One extra bullet point here")
        applied = [
            ResumeChange(
                path="workExperience[0].description",
                action="append",
                original=None,
                value="One extra bullet point here",
                reason="z",
            )
        ]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        word_warnings = [w for w in warnings if "word count" in w.lower()]
        assert len(word_warnings) == 0


class TestVerifyInventedMetrics:
    """Check 5: Invented metrics detection."""

    def test_warns_on_invented_percentage(self, sample_resume, sample_job_keywords):
        applied = [
            ResumeChange(
                path="workExperience[0].description[0]",
                action="replace",
                original="Built REST APIs",
                value="Built REST APIs improving throughput by 40%",
                reason="Added metric",
            )
        ]
        result = copy.deepcopy(sample_resume)
        result["workExperience"][0]["description"][0] = "Built REST APIs improving throughput by 40%"
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        assert any("metric" in w.lower() or "40%" in w for w in warnings)

    def test_no_warning_on_preserved_metric(self, sample_resume, sample_job_keywords):
        """If the original already had the metric, no warning."""
        applied = [
            ResumeChange(
                path="workExperience[0].description[0]",
                action="replace",
                original="Built REST APIs serving 50K requests/day using Python and FastAPI",
                value="Designed REST APIs serving 50K requests/day with Python and FastAPI",
                reason="Rephrased",
            )
        ]
        result = copy.deepcopy(sample_resume)
        result["workExperience"][0]["description"][0] = applied[0].value
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        metric_warnings = [w for w in warnings if "metric" in w.lower()]
        assert len(metric_warnings) == 0

    def test_warns_on_invented_dollar_amount(self, sample_resume, sample_job_keywords):
        applied = [
            ResumeChange(
                path="workExperience[1].description[0]",
                action="replace",
                original="Developed payment processing system handling $2M monthly",
                value="Developed payment processing system handling $5M monthly",
                reason="Inflated",
            )
        ]
        result = copy.deepcopy(sample_resume)
        result["workExperience"][1]["description"][0] = applied[0].value
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        assert any("$5M" in w or "metric" in w.lower() for w in warnings)


class TestVerifyMultipleWarnings:
    """Edge case: multiple warnings from a single verification run."""

    def test_multiple_warnings_all_reported(self, sample_resume, sample_job_keywords):
        """A result with section count drift AND identity change should produce both warnings."""
        result = copy.deepcopy(sample_resume)
        # Trigger section count warning: drop a work experience entry
        result["workExperience"] = result["workExperience"][:1]
        # Trigger identity field warning: change company name on remaining entry
        result["workExperience"][0]["company"] = "Different Corp"
        applied = [
            ResumeChange(path="summary", action="replace", original="x", value="y", reason="z")
        ]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        section_warnings = [w for w in warnings if "section count" in w.lower() or "work experience" in w.lower()]
        identity_warnings = [w for w in warnings if "identity" in w.lower() or "company" in w.lower()]
        assert len(section_warnings) >= 1
        assert len(identity_warnings) >= 1
        assert len(warnings) >= 2

    def test_metric_warning_plus_word_count_warning(self, sample_resume, sample_job_keywords):
        """Invented metric and word count explosion in the same result."""
        result = copy.deepcopy(sample_resume)
        long_text = "Improved revenue by 99% " + ("extra words " * 200)
        result["workExperience"][0]["description"] = [long_text] * 5
        result["workExperience"][1]["description"] = [long_text] * 5
        applied = [
            ResumeChange(
                path="workExperience[0].description[0]",
                action="replace",
                original="Built REST APIs serving 50K requests/day using Python and FastAPI",
                value=long_text,
                reason="over-elaborate",
            )
        ]
        warnings = verify_diff_result(sample_resume, result, applied, sample_job_keywords)
        has_metric = any("metric" in w.lower() or "99%" in w for w in warnings)
        has_word_count = any("word count" in w.lower() for w in warnings)
        assert has_metric
        assert has_word_count
