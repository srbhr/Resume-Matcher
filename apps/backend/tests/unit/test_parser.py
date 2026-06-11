"""Unit tests for pure parsing helpers in app.services.parser.

The LLM frequently drops months when parsing resume dates ("Jun 2020 - Aug 2021"
→ "2020 - 2021"). restore_dates_from_markdown() patches that back from the raw
markdown. This is pure, deterministic logic — the parser module was at ~20%
coverage with none of it exercised.
"""

from app.services.parser import _extract_markdown_dates, restore_dates_from_markdown


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
