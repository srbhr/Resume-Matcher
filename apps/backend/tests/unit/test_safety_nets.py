"""The tailoring safety nets: what an LLM result may never lose or invent.

They run after every tailoring as defense in depth. Earlier layers (the diff
path block-list, ``finalize_ai_resume``) catch most of these edits first, so a
pipeline-level test can't see whether a net still works; these tests pin each
one directly.
"""

import copy
from typing import Any

import pytest

from app.services.safety_nets import (
    _preserve_original_skills,
    _preserve_personal_info,
    _protect_custom_sections,
    _restore_original_dates,
)


def entries(section: str, *years: str) -> dict[str, Any]:
    return {section: [{"years": y} for y in years]}


class TestRestoreOriginalDates:
    def test_without_an_original_returns_the_result_untouched(self) -> None:
        improved = entries("workExperience", "2021 - Present")
        assert _restore_original_dates(None, improved) is improved

    @pytest.mark.parametrize(
        "section", ["workExperience", "education", "personalProjects"]
    )
    def test_puts_back_a_month_the_llm_dropped(self, section: str) -> None:
        original = entries(section, "Jan 2021 - Present")
        result = _restore_original_dates(original, entries(section, "2021 - Present"))
        assert result[section][0]["years"] == "Jan 2021 - Present"

    @pytest.mark.parametrize(
        ("original", "tailored"),
        [
            ("Jan 2021 - Present", "Feb 2021 - Present"),  # result still has a month
            ("2014 - 2018", "2015 - 2018"),  # original had no month to lose
            ("Jan 2021 - Present", "Jan 2021 - Present"),  # unchanged
            ("", "2021"),  # nothing to restore
        ],
    )
    def test_leaves_dates_that_lost_no_month(
        self, original: str, tailored: str
    ) -> None:
        result = _restore_original_dates(
            entries("workExperience", original), entries("workExperience", tailored)
        )
        assert result["workExperience"][0]["years"] == tailored

    def test_matches_entries_by_position_and_tolerates_length_changes(self) -> None:
        original = entries(
            "workExperience", "Jan 2021 - Present", "Jun 2018 - Dec 2020"
        )
        shorter = _restore_original_dates(
            original, entries("workExperience", "2021 - Now")
        )
        assert shorter["workExperience"] == [{"years": "Jan 2021 - Present"}]
        longer = _restore_original_dates(
            entries("workExperience", "Jan 2021 - Present"),
            entries("workExperience", "2021 - Now", "2010 - 2012"),
        )
        assert longer["workExperience"][1] == {"years": "2010 - 2012"}

    def test_restores_item_list_custom_sections_only(self) -> None:
        def custom(section_type: str, years: str) -> dict[str, Any]:
            return {
                "customSections": {
                    "talks": {"sectionType": section_type, "items": [{"years": years}]}
                }
            }

        restored = _restore_original_dates(
            custom("itemList", "Mar 2022"), custom("itemList", "2022")
        )
        assert restored["customSections"]["talks"]["items"][0]["years"] == "Mar 2022"
        other = _restore_original_dates(
            custom("text", "Mar 2022"), custom("text", "2022")
        )
        assert other["customSections"]["talks"]["items"][0]["years"] == "2022"

    def test_does_not_mutate_its_inputs(self) -> None:
        original = entries("workExperience", "Jan 2021 - Present")
        improved = entries("workExperience", "2021 - Present")
        snapshot = copy.deepcopy((original, improved))
        _restore_original_dates(original, improved)
        assert (original, improved) == snapshot


class TestPreserveOriginalSkills:
    FIELDS = ("technicalSkills", "certificationsTraining", "languages", "awards")

    def test_without_an_original_returns_the_result_untouched(self) -> None:
        improved = {"additional": {"technicalSkills": ["Go"]}}
        assert _preserve_original_skills(None, improved) is improved

    @pytest.mark.parametrize("field", FIELDS)
    def test_appends_dropped_items_after_the_kept_ones(self, field: str) -> None:
        original = {"additional": {field: ["Python", "AWS", "Docker"]}}
        improved = {"additional": {field: ["Docker", "Kubernetes"]}}
        result = _preserve_original_skills(original, improved)
        assert result["additional"][field] == ["Docker", "Kubernetes", "Python", "AWS"]

    def test_matches_case_insensitively_and_never_duplicates(self) -> None:
        original = {"additional": {"technicalSkills": ["Python", "python", "AWS"]}}
        improved = {"additional": {"technicalSkills": ["PYTHON"]}}
        result = _preserve_original_skills(original, improved)
        assert result["additional"]["technicalSkills"] == ["PYTHON", "AWS"]

    def test_replaces_a_non_list_field_with_the_originals(self) -> None:
        original = {"additional": {"languages": ["English"]}}
        result = _preserve_original_skills(original, {"additional": {"languages": "?"}})
        assert result["additional"]["languages"] == ["English"]

    def test_creates_the_additional_block_when_the_llm_removed_it(self) -> None:
        result = _preserve_original_skills({"additional": {"awards": ["Gold"]}}, {})
        assert result["additional"] == {"awards": ["Gold"]}

    def test_ignores_an_original_without_an_additional_block(self) -> None:
        improved = {"summary": "x"}
        assert _preserve_original_skills({"additional": "bad"}, improved) == improved

    def test_does_not_mutate_its_inputs(self) -> None:
        original = {"additional": {"technicalSkills": ["Python"]}}
        improved = {"additional": {"technicalSkills": []}}
        snapshot = copy.deepcopy((original, improved))
        _preserve_original_skills(original, improved)
        assert (original, improved) == snapshot


class TestProtectCustomSections:
    def item_list(self, *items: dict[str, Any]) -> dict[str, Any]:
        return {"sectionType": "itemList", "items": list(items)}

    def test_without_custom_sections_returns_the_result_untouched(self) -> None:
        improved = {"customSections": {"x": {}}}
        assert _protect_custom_sections(None, improved) is improved
        assert _protect_custom_sections({"customSections": {}}, improved) is improved

    def test_restores_a_section_the_llm_removed(self) -> None:
        talks = self.item_list({"title": "PyCon"})
        result = _protect_custom_sections(
            {"customSections": {"talks": talks}}, {"customSections": {}}
        )
        assert result["customSections"]["talks"] == talks

    def test_trims_items_the_llm_added(self) -> None:
        original = {"customSections": {"talks": self.item_list({"title": "PyCon"})}}
        improved = {
            "customSections": {
                "talks": self.item_list({"title": "PyCon"}, {"title": "Invented"})
            }
        }
        result = _protect_custom_sections(original, improved)
        assert result["customSections"]["talks"]["items"] == [{"title": "PyCon"}]

    def test_reverts_a_description_invented_for_an_item_that_had_none(self) -> None:
        original = {
            "customSections": {
                "talks": self.item_list(
                    {"title": "A", "description": []},
                    {"title": "B", "description": ["Spoke on APIs"]},
                )
            }
        }
        improved = {
            "customSections": {
                "talks": self.item_list(
                    {"title": "A", "description": ["Keynote to 10k people"]},
                    {"title": "B", "description": ["Spoke on FastAPI APIs"]},
                )
            }
        }
        items = _protect_custom_sections(original, improved)["customSections"]["talks"][
            "items"
        ]
        assert items[0]["description"] == []
        assert items[1]["description"] == ["Spoke on FastAPI APIs"]

    def test_keeps_a_result_whose_custom_sections_are_not_a_mapping(self) -> None:
        original = {"customSections": {"talks": self.item_list()}}
        assert _protect_custom_sections(original, {"customSections": None}) == {
            "customSections": None
        }


class TestPreservePersonalInfo:
    def test_without_an_original_warns_and_keeps_the_result(self) -> None:
        improved = {"personalInfo": {"name": "X"}}
        result, warnings = _preserve_personal_info(None, improved)
        assert result is improved
        assert warnings == [
            "Original resume data unavailable - personal info may be AI-generated"
        ]

    def test_warns_when_the_original_has_no_personal_info(self) -> None:
        result, warnings = _preserve_personal_info({"summary": "s"}, {"summary": "t"})
        assert result == {"summary": "t"}
        assert warnings == ["Original personal info missing or invalid"]

    def test_replaces_personal_info_with_an_independent_copy_of_the_original(
        self,
    ) -> None:
        original = {"personalInfo": {"name": "Ada", "email": "ada@example.com"}}
        improved = {"personalInfo": {"name": "Someone Else"}, "summary": "t"}
        result, warnings = _preserve_personal_info(original, improved)
        assert warnings == []
        assert result == {
            "personalInfo": {"name": "Ada", "email": "ada@example.com"},
            "summary": "t",
        }
        result["personalInfo"]["name"] = "changed"
        assert original["personalInfo"]["name"] == "Ada"
        assert improved["personalInfo"]["name"] == "Someone Else"
