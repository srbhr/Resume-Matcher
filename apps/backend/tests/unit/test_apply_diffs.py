"""Unit tests for apply_diffs() — path resolution, verification gates, and actions."""

import copy
import pytest

from app.schemas.models import ResumeChange
from app.services.improver import apply_diffs


class TestApplyDiffsReplace:
    """Tests for the 'replace' action."""

    def test_replace_summary(self, sample_resume):
        changes = [
            ResumeChange(
                path="summary",
                action="replace",
                original=sample_resume["summary"],
                value="Updated summary text.",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 1
        assert len(rejected) == 0
        assert result["summary"] == "Updated summary text."

    def test_replace_description_bullet(self, sample_resume):
        original_bullet = sample_resume["workExperience"][0]["description"][1]
        changes = [
            ResumeChange(
                path="workExperience[0].description[1]",
                action="replace",
                original=original_bullet,
                value="Architected microservices migration serving 100K users",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 1
        assert result["workExperience"][0]["description"][1] == changes[0].value

    def test_replace_project_description_bullet(self, sample_resume):
        original_bullet = sample_resume["personalProjects"][0]["description"][0]
        changes = [
            ResumeChange(
                path="personalProjects[0].description[0]",
                action="replace",
                original=original_bullet,
                value="Python CLI tool generating API clients from OpenAPI specs",
                reason="Added Python keyword",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 1
        assert result["personalProjects"][0]["description"][0] == changes[0].value

    def test_replace_case_insensitive_original_match(self, sample_resume):
        original_bullet = sample_resume["workExperience"][0]["description"][0]
        changes = [
            ResumeChange(
                path="workExperience[0].description[0]",
                action="replace",
                original=original_bullet.upper(),  # Case difference
                value="New text",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 1


class TestApplyDiffsAppend:
    """Tests for the 'append' action."""

    def test_append_bullet_to_experience(self, sample_resume):
        original_count = len(sample_resume["workExperience"][0]["description"])
        changes = [
            ResumeChange(
                path="workExperience[0].description",
                action="append",
                original=None,
                value="Implemented CI/CD pipelines with GitHub Actions",
                reason="Added CI/CD keyword",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 1
        assert len(result["workExperience"][0]["description"]) == original_count + 1
        assert result["workExperience"][0]["description"][-1] == changes[0].value

    def test_append_bullet_to_project(self, sample_resume):
        original_count = len(sample_resume["personalProjects"][0]["description"])
        changes = [
            ResumeChange(
                path="personalProjects[0].description",
                action="append",
                original=None,
                value="Published to PyPI with 10K+ monthly downloads",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 1
        assert len(result["personalProjects"][0]["description"]) == original_count + 1


class TestApplyDiffsReorder:
    """Tests for the 'reorder' action."""

    def test_reorder_skills(self, sample_resume):
        original_skills = sample_resume["additional"]["technicalSkills"]
        reordered = list(reversed(original_skills))
        changes = [
            ResumeChange(
                path="additional.technicalSkills",
                action="reorder",
                original=None,
                value=reordered,
                reason="Prioritized relevant skills",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 1
        assert result["additional"]["technicalSkills"] == reordered

    def test_reorder_rejects_different_items(self, sample_resume):
        changes = [
            ResumeChange(
                path="additional.technicalSkills",
                action="reorder",
                original=None,
                value=["Python", "Kubernetes", "Go"],  # Different items
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 0
        assert len(rejected) == 1

    def test_reorder_case_insensitive_matching(self, sample_resume):
        original_skills = sample_resume["additional"]["technicalSkills"]
        reordered = [s.lower() for s in reversed(original_skills)]
        changes = [
            ResumeChange(
                path="additional.technicalSkills",
                action="reorder",
                original=None,
                value=reordered,
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 1


class TestApplyDiffsBlockedPaths:
    """Tests for blocked path rejection."""

    @pytest.mark.parametrize("path,original_val", [
        ("personalInfo.name", "Jane Doe"),
        ("personalInfo.email", "jane@example.com"),
    ])
    def test_reject_personal_info(self, sample_resume, path, original_val):
        changes = [
            ResumeChange(path=path, action="replace", original=original_val, value="X", reason="test")
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1
        assert len(applied) == 0

    def test_reject_date_change(self, sample_resume):
        changes = [
            ResumeChange(
                path="workExperience[0].years",
                action="replace",
                original="Jan 2021 - Present",
                value="Jan 2019 - Present",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_reject_company_change(self, sample_resume):
        changes = [
            ResumeChange(
                path="workExperience[0].company",
                action="replace",
                original="Acme Corp",
                value="Google",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_reject_education_change(self, sample_resume):
        changes = [
            ResumeChange(
                path="education[0].degree",
                action="replace",
                original="B.S. Computer Science",
                value="M.S. Computer Science",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_reject_custom_sections(self, sample_resume):
        changes = [
            ResumeChange(
                path="customSections.volunteer",
                action="replace",
                original=None,
                value="Volunteer work",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_reject_project_role(self, sample_resume):
        changes = [
            ResumeChange(
                path="personalProjects[0].role",
                action="replace",
                original="Creator & Maintainer",
                value="CTO",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_reject_location_change(self, sample_resume):
        changes = [
            ResumeChange(
                path="workExperience[0].location",
                action="replace",
                original="San Francisco, CA",
                value="Remote",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1


class TestApplyDiffsVerificationGates:
    """Tests for path resolution and original text verification."""

    def test_reject_out_of_bounds_index(self, sample_resume):
        changes = [
            ResumeChange(
                path="workExperience[99].description[0]",
                action="replace",
                original="Nonexistent",
                value="New",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_reject_original_text_mismatch(self, sample_resume):
        changes = [
            ResumeChange(
                path="workExperience[0].description[0]",
                action="replace",
                original="This text does not exist anywhere in the resume",
                value="New text",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_reject_unknown_action_at_schema_level(self, sample_resume):
        """Pydantic Literal type prevents invalid actions before apply_diffs sees them."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            ResumeChange(
                path="summary",
                action="delete",  # type: ignore[arg-type]
                original=sample_resume["summary"],
                value="",
                reason="test",
            )

    def test_reject_nonexistent_path(self, sample_resume):
        changes = [
            ResumeChange(
                path="nonexistent.field",
                action="replace",
                original="x",
                value="y",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1


class TestApplyDiffsIntegrity:
    """Tests for data integrity and multi-change scenarios."""

    def test_does_not_mutate_original(self, sample_resume):
        original_copy = copy.deepcopy(sample_resume)
        changes = [
            ResumeChange(
                path="summary",
                action="replace",
                original=sample_resume["summary"],
                value="Changed",
                reason="test",
            )
        ]
        result, _, _ = apply_diffs(sample_resume, changes)
        assert sample_resume == original_copy
        assert result["summary"] == "Changed"

    def test_multiple_changes_partial_rejection(self, sample_resume):
        changes = [
            ResumeChange(
                path="summary",
                action="replace",
                original=sample_resume["summary"],
                value="New summary",
                reason="good",
            ),
            ResumeChange(
                path="personalInfo.name",
                action="replace",
                original="Jane Doe",
                value="Bad",
                reason="blocked",
            ),
            ResumeChange(
                path="workExperience[0].description[0]",
                action="replace",
                original=sample_resume["workExperience"][0]["description"][0],
                value="Updated bullet",
                reason="good",
            ),
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 2
        assert len(rejected) == 1
        assert result["summary"] == "New summary"
        assert result["personalInfo"]["name"] == "Jane Doe"  # Unchanged

    def test_empty_changes_list(self, sample_resume):
        result, applied, rejected = apply_diffs(sample_resume, [])
        assert len(applied) == 0
        assert len(rejected) == 0
        assert result == sample_resume

    def test_all_changes_applied(self, sample_resume, sample_changes):
        result, applied, rejected = apply_diffs(sample_resume, sample_changes)
        assert len(rejected) == 0
        assert len(applied) == len(sample_changes)


class TestApplyDiffsEdgeCases:
    """Edge cases: hostile inputs, malformed paths, boundary conditions."""

    def test_append_to_non_list_rejected(self, sample_resume):
        """Append to a string field (summary) should be rejected."""
        changes = [
            ResumeChange(
                path="summary",
                action="append",
                original=None,
                value="Extra text",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1
        assert len(applied) == 0

    def test_reorder_non_list_rejected(self, sample_resume):
        """Reorder on a string field should be rejected."""
        changes = [
            ResumeChange(
                path="summary",
                action="reorder",
                original=None,
                value=["a", "b"],
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_reorder_with_non_list_value_rejected(self, sample_resume):
        """Reorder where value is a string instead of list should be rejected."""
        changes = [
            ResumeChange(
                path="additional.technicalSkills",
                action="reorder",
                original=None,
                value="Python, Docker",  # type: ignore[arg-type]
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_reorder_with_duplicates_rejected(self, sample_resume):
        """Reorder that adds duplicates not in original should be rejected."""
        changes = [
            ResumeChange(
                path="additional.technicalSkills",
                action="reorder",
                original=None,
                value=["Python", "Python", "Docker", "AWS", "PostgreSQL"],  # Python duplicated, Redis missing
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_empty_path_rejected(self, sample_resume):
        """Empty path string should be rejected."""
        changes = [
            ResumeChange(
                path="",
                action="replace",
                original="x",
                value="y",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_deeply_nested_invalid_path_rejected(self, sample_resume):
        """Path with too many segments that don't resolve."""
        changes = [
            ResumeChange(
                path="workExperience[0].description[0].nested.deep",
                action="replace",
                original="x",
                value="y",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_negative_index_rejected(self, sample_resume):
        """Negative array index should not resolve."""
        changes = [
            ResumeChange(
                path="workExperience[-1].description[0]",
                action="replace",
                original="x",
                value="y",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(rejected) == 1

    def test_second_experience_entry(self, sample_resume):
        """Changes to the second work experience entry should work."""
        original_bullet = sample_resume["workExperience"][1]["description"][0]
        changes = [
            ResumeChange(
                path="workExperience[1].description[0]",
                action="replace",
                original=original_bullet,
                value="Updated payment system description",
                reason="test",
            )
        ]
        result, applied, rejected = apply_diffs(sample_resume, changes)
        assert len(applied) == 1
        assert result["workExperience"][1]["description"][0] == "Updated payment system description"
        # First entry unchanged
        assert result["workExperience"][0]["description"][0] == sample_resume["workExperience"][0]["description"][0]
