"""Unit tests for pure parsing helpers in app.services.parser.

The LLM frequently drops months when parsing resume dates ("Jun 2020 - Aug 2021"
→ "2020 - 2021"). restore_dates_from_markdown() patches that back from the raw
markdown. This is pure, deterministic logic — the parser module was at ~20%
coverage with none of it exercised.
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.services.parser import (
    _MAX_RESUME_CONTENT_RECURSION,
    _extract_markdown_dates,
    has_meaningful_resume_content,
    parse_resume_to_json,
    restore_dates_from_markdown,
)


def _wrap(value: object, levels: int) -> object:
    """Nest ``value`` inside ``levels`` plain dicts.

    ``has_meaningful_resume_content`` starts the recursion at depth 0 on the
    section value, so ``levels`` wrappers put the string at depth ``levels``.
    """
    for _ in range(levels):
        value = {"value": value}
    return value


class TestExtractMarkdownDates:
    def test_finds_full_range(self):
        assert _extract_markdown_dates("Worked Jun 2020 - Aug 2021 there") == ["Jun 2020 - Aug 2021"]

    def test_finds_present_range(self):
        assert _extract_markdown_dates("May 2021 - Present") == ["May 2021 - Present"]

    def test_finds_single_date(self):
        assert _extract_markdown_dates("Graduated Jun 2023") == ["Jun 2023"]

    def test_ignores_year_only(self):
        # Year-only "2020 - 2021" has no month token → not captured.
        assert _extract_markdown_dates("2020 - 2021") == []


class TestRestoreDatesFromMarkdown:
    def test_restores_months_in_work_experience(self):
        parsed = {"workExperience": [{"title": "Dev", "years": "2020 - 2021"}]}
        markdown = "Senior Dev, Jun 2020 - Aug 2021, built things"
        result = restore_dates_from_markdown(parsed, markdown)
        assert result["workExperience"][0]["years"] == "Jun 2020 - Aug 2021"

    def test_restores_single_date(self):
        parsed = {"education": [{"degree": "BS", "years": "2023"}]}
        markdown = "B.S. Computer Science, Jun 2023"
        result = restore_dates_from_markdown(parsed, markdown)
        assert result["education"][0]["years"] == "Jun 2023"

    def test_leaves_entries_that_already_have_months(self):
        parsed = {"workExperience": [{"years": "Jan 2020 - Mar 2021"}]}
        markdown = "Jun 2020 - Aug 2021"  # same years, different months
        result = restore_dates_from_markdown(parsed, markdown)
        # Already month-precise → must NOT be overwritten.
        assert result["workExperience"][0]["years"] == "Jan 2020 - Mar 2021"

    def test_no_markdown_dates_is_noop(self):
        parsed = {"workExperience": [{"years": "2020 - 2021"}]}
        result = restore_dates_from_markdown(parsed, "no dates here at all")
        assert result["workExperience"][0]["years"] == "2020 - 2021"

    def test_no_matching_year_key_is_noop(self):
        parsed = {"workExperience": [{"years": "2019 - 2020"}]}
        markdown = "Jun 2021 - Aug 2022"  # different years → no match
        result = restore_dates_from_markdown(parsed, markdown)
        assert result["workExperience"][0]["years"] == "2019 - 2020"

    def test_restores_in_custom_item_list_sections(self):
        parsed = {
            "customSections": {
                "volunteering": {
                    "sectionType": "itemList",
                    "items": [{"name": "Mentor", "years": "2020 - 2021"}],
                }
            }
        }
        markdown = "Mentor, Jun 2020 - Aug 2021"
        result = restore_dates_from_markdown(parsed, markdown)
        assert result["customSections"]["volunteering"]["items"][0]["years"] == "Jun 2020 - Aug 2021"

    def test_tolerates_missing_sections(self):
        # Should not raise on a minimal/odd structure.
        parsed = {"personalInfo": {"name": "X"}}
        assert restore_dates_from_markdown(parsed, "Jun 2020 - Aug 2021") == parsed

    def test_skips_non_dict_entries(self):
        parsed = {"workExperience": ["not a dict", {"years": "2020 - 2021"}]}
        markdown = "Jun 2020 - Aug 2021"
        result = restore_dates_from_markdown(parsed, markdown)
        assert result["workExperience"][1]["years"] == "Jun 2020 - Aug 2021"


class TestMeaningfulResumeContent:
    def test_rejects_schema_defaults_only(self):
        assert has_meaningful_resume_content(
            {
                "personalInfo": {},
                "summary": "",
                "workExperience": [],
                "education": [],
                "personalProjects": [],
                "additional": {"technicalSkills": []},
                "customSections": {},
            }
        ) is False

    def test_accepts_experience_without_contact_details(self):
        assert has_meaningful_resume_content(
            {"personalInfo": {}, "workExperience": [{"title": "Engineer"}]}
        ) is True

    def test_rejects_default_only_section_entries(self):
        assert has_meaningful_resume_content(
            {
                "workExperience": [
                    {
                        "id": 0,
                        "title": "",
                        "company": "",
                        "years": "",
                        "description": [],
                        "descriptionStyles": [],
                    }
                ],
                "customSections": {
                    "empty": {
                        "sectionType": "itemList",
                        "items": [{"id": 0, "title": "", "description": []}],
                    }
                },
            }
        ) is False

    def test_accepts_additional_and_custom_section_text(self):
        assert has_meaningful_resume_content(
            {"additional": {"technicalSkills": ["Python"]}}
        ) is True
        assert has_meaningful_resume_content(
            {"customSections": {"publications": {"sectionType": "text", "text": "Paper"}}}
        ) is True

    def test_accepts_custom_section_with_a_reserved_identifier(self):
        assert has_meaningful_resume_content(
            {"customSections": {"key": {"sectionType": "text", "text": "Paper"}}}
        ) is True

    def test_rejects_content_beyond_the_recursion_limit(self):
        deeply_nested: object = "Resume content"
        for _ in range(11):
            deeply_nested = {"value": deeply_nested}

        assert has_meaningful_resume_content({"summary": deeply_nested}) is False

    def test_finds_content_at_the_last_allowed_depth(self):
        """Boundary: a value at depth ``limit - 1`` is still inspected."""
        nested = _wrap("Resume content", _MAX_RESUME_CONTENT_RECURSION - 1)

        assert has_meaningful_resume_content({"summary": nested}) is True

    def test_rejects_content_one_level_past_the_limit(self):
        """Boundary: a value at exactly ``limit`` is cut off (declared empty).

        This is the documented, accepted false negative. It is unreachable for
        schema-valid resumes -- see test_deepest_real_schema_content_is_found
        and the comment on _MAX_RESUME_CONTENT_RECURSION.
        """
        nested = _wrap("Resume content", _MAX_RESUME_CONTENT_RECURSION)

        assert has_meaningful_resume_content({"summary": nested}) is False

    def test_deepest_real_schema_content_is_found(self):
        """The deepest path ResumeData allows (depth 5) stays well inside 10.

        customSections(0) -> CustomSection(1) -> items(2) -> item(3)
        -> description(4) -> bullet(5).
        """
        assert has_meaningful_resume_content(
            {
                "customSections": {
                    "publications": {
                        "sectionType": "itemList",
                        "items": [
                            {
                                "id": 0,
                                "title": "",
                                "subtitle": None,
                                "years": "",
                                "description": ["A paper nobody should lose"],
                                "descriptionStyles": [],
                            }
                        ],
                    }
                }
            }
        ) is True

    @pytest.mark.asyncio
    @patch("app.services.parser.complete_json", new_callable=AsyncMock)
    async def test_parse_rejects_empty_llm_json(self, mock_complete_json):
        mock_complete_json.return_value = {}
        with pytest.raises(ValueError, match="empty structured resume"):
            await parse_resume_to_json("Jane Doe")

    @pytest.mark.asyncio
    @patch("app.services.parser.complete_json", new_callable=AsyncMock)
    async def test_parse_rejects_default_only_llm_entries(self, mock_complete_json):
        mock_complete_json.return_value = {"workExperience": [{}]}
        with pytest.raises(ValueError, match="empty structured resume"):
            await parse_resume_to_json("Jane Doe")
