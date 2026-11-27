"""Section metadata for custom sections that arrive without it (#1012)."""

import copy
from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.models import DEFAULT_SECTION_META, ResumeData, normalize_resume_data

pytestmark = pytest.mark.unit


def _parsed_resume() -> dict[str, Any]:
    # Shaped like the parser output: custom sections but no sectionMeta.
    return {
        "personalInfo": {"name": "Jane Doe"},
        "summary": "Engineer.",
        "customSections": {
            "publications": {
                "sectionType": "itemList",
                "items": [{"id": 1, "title": "A paper", "years": "2024"}],
            },
            "volunteer_work": {
                "sectionType": "stringList",
                "strings": ["Food bank"],
            },
        },
    }


def _meta_by_key(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {meta["key"]: meta for meta in data["sectionMeta"]}


def test_parsed_custom_sections_get_meta_after_the_built_ins() -> None:
    data = normalize_resume_data(_parsed_resume())

    meta = _meta_by_key(data)
    assert meta["publications"] == {
        "id": "publications",
        "key": "publications",
        "displayName": "Publications",
        "sectionType": "itemList",
        "isDefault": False,
        "isVisible": True,
        "order": 6,
    }
    assert meta["volunteer_work"]["displayName"] == "Volunteer Work"
    assert meta["volunteer_work"]["sectionType"] == "stringList"
    assert meta["volunteer_work"]["order"] == 7

    resume = ResumeData.model_validate(data)
    custom = [s for s in resume.sectionMeta if not s.isDefault]
    assert [s.key for s in custom] == ["publications", "volunteer_work"]


def test_custom_meta_saved_as_default_is_marked_custom() -> None:
    # PATCH clients that leave out isDefault get the model default, True.
    data = _parsed_resume()
    data["sectionMeta"] = copy.deepcopy(DEFAULT_SECTION_META) + [
        {
            "id": "publications",
            "key": "publications",
            "displayName": "Papers",
            "sectionType": "itemList",
            "isDefault": True,
            "isVisible": True,
            "order": 6,
        }
    ]

    meta = _meta_by_key(normalize_resume_data(data))

    assert meta["publications"]["isDefault"] is False
    assert meta["publications"]["displayName"] == "Papers"
    assert meta["volunteer_work"]["order"] == 7


def test_existing_custom_meta_is_kept_as_is() -> None:
    data = _parsed_resume()
    stored = copy.deepcopy(DEFAULT_SECTION_META) + [
        {
            "id": "custom_1",
            "key": "publications",
            "displayName": "Papers",
            "sectionType": "itemList",
            "isDefault": False,
            "isVisible": False,
            "order": 9,
        },
        {
            "id": "custom_2",
            "key": "volunteer_work",
            "displayName": "Volunteering",
            "sectionType": "stringList",
            "isDefault": False,
            "isVisible": True,
            "order": 2,
        },
    ]
    data["sectionMeta"] = copy.deepcopy(stored)

    assert normalize_resume_data(data)["sectionMeta"] == stored


def test_built_in_meta_and_stored_entries_are_not_mutated() -> None:
    data = _parsed_resume()
    data["customSections"]["summary"] = {"sectionType": "text", "text": "Stray copy"}
    custom = {
        "id": "publications",
        "key": "publications",
        "displayName": "Papers",
        "sectionType": "itemList",
        "isDefault": True,
        "isVisible": True,
        "order": 6,
    }
    data["sectionMeta"] = copy.deepcopy(DEFAULT_SECTION_META) + [custom]

    meta = _meta_by_key(normalize_resume_data(data))

    assert all(meta[m["key"]]["isDefault"] for m in DEFAULT_SECTION_META)
    assert custom["isDefault"] is True


def test_extra_key_saved_as_default_without_data_is_marked_custom() -> None:
    data = {
        "sectionMeta": copy.deepcopy(DEFAULT_SECTION_META)
        + [
            {
                "id": "publications",
                "key": "publications",
                "displayName": "Publications",
                "sectionType": "itemList",
                "isDefault": True,
                "isVisible": True,
                "order": 6,
            }
        ],
    }

    meta = _meta_by_key(normalize_resume_data(data))

    assert meta["publications"]["isDefault"] is False


@pytest.mark.parametrize(
    ("key", "name"),
    [
        ("volunteer_work", "Volunteer Work"),
        ("volunteerWork", "Volunteer Work"),
        ("courses-taken", "Courses Taken"),
    ],
)
def test_display_name_comes_from_the_key(key: str, name: str) -> None:
    data = {"customSections": {key: {"sectionType": "text", "text": "x"}}}

    assert _meta_by_key(normalize_resume_data(data))[key]["displayName"] == name


@pytest.mark.parametrize("section_meta", ["bogus", ["bogus"]])
def test_malformed_meta_is_left_for_validation(section_meta: Any) -> None:
    data = normalize_resume_data({"sectionMeta": section_meta, "customSections": {}})

    assert data["sectionMeta"] == section_meta
    with pytest.raises(ValidationError):
        ResumeData.model_validate(data)


def test_custom_meta_without_is_default_is_marked_custom() -> None:
    # Raw data (stored rows, MCP input) can leave the key out entirely.
    data = _parsed_resume()
    data["sectionMeta"] = copy.deepcopy(DEFAULT_SECTION_META) + [
        {
            "id": "publications",
            "key": "publications",
            "displayName": "Papers",
            "sectionType": "itemList",
            "isVisible": True,
            "order": 6,
        }
    ]

    meta = _meta_by_key(normalize_resume_data(data))

    assert meta["publications"]["isDefault"] is False


@pytest.mark.parametrize("bad_key", [["publications"], {"k": 1}])
def test_a_malformed_meta_key_is_left_for_validation(bad_key) -> None:
    data = _parsed_resume()
    data["sectionMeta"] = copy.deepcopy(DEFAULT_SECTION_META) + [
        {"id": "x", "key": bad_key, "isDefault": True, "order": 6}
    ]

    normalized = normalize_resume_data(data)

    with pytest.raises(ValidationError):
        ResumeData.model_validate(normalized)
