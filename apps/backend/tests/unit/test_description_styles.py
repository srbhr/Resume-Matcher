from app.schemas.models import CustomSectionItem, Experience, Project, ResumeData


def test_experience_description_styles_are_aligned_to_descriptions() -> None:
    experience = Experience.model_validate(
        {
            "description": ["Built APIs", "Led migrations", "Reduced latency"],
            "descriptionStyles": [None, "plain"],
        }
    )

    assert experience.descriptionStyles == ["bullet", "plain", "bullet"]


def test_project_description_styles_are_trimmed_to_description_count() -> None:
    project = Project.model_validate(
        {
            "description": ["Built CLI"],
            "descriptionStyles": ["plain", "bullet"],
        }
    )

    assert project.descriptionStyles == ["plain"]


def test_resume_data_defaults_missing_custom_item_styles_to_bullets() -> None:
    resume = ResumeData.model_validate(
        {
            "customSections": {
                "publications": {
                    "sectionType": "itemList",
                    "items": [
                        {
                            "title": "Paper",
                            "description": ["Accepted", "Presented"],
                        }
                    ],
                }
            }
        }
    )

    item = resume.customSections["publications"].items[0]
    assert isinstance(item, CustomSectionItem)
    assert item.descriptionStyles == ["bullet", "bullet"]
