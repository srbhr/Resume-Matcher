from app.services.improver import calculate_resume_diff


def test_skill_add_remove_case_insensitive() -> None:
    original = {"additional": {"technicalSkills": ["Python", "React"]}}
    improved = {"additional": {"technicalSkills": ["python", "Go"]}}

    summary, changes = calculate_resume_diff(original, improved)

    added = [c for c in changes if c.field_type == "skill" and c.change_type == "added"]
    removed = [
        c for c in changes if c.field_type == "skill" and c.change_type == "removed"
    ]

    assert [c.new_value for c in added] == ["Go"]
    assert [c.original_value for c in removed] == ["React"]
    assert summary.skills_added == 1
    assert summary.skills_removed == 1
    assert summary.high_risk_changes == 1


def test_skill_order_is_ignored() -> None:
    original = {"additional": {"technicalSkills": ["Go", "Python"]}}
    improved = {"additional": {"technicalSkills": ["Python", "Go"]}}

    summary, changes = calculate_resume_diff(original, improved)

    skill_changes = [c for c in changes if c.field_type == "skill"]
    assert skill_changes == []
    assert summary.skills_added == 0
    assert summary.skills_removed == 0


def test_description_modified_count_is_strict() -> None:
    original = {"workExperience": [{"description": ["Built APIs", "Led team"]}]}
    improved = {"workExperience": [{"description": ["Built APIs", "Led squad"]}]}

    summary, changes = calculate_resume_diff(original, improved)

    description_changes = [
        c for c in changes if c.field_type == "description" and c.change_type == "modified"
    ]
    assert len(description_changes) == 1
    assert summary.descriptions_modified == 1


def test_handles_malformed_lists_gracefully() -> None:
    original = {
        "additional": {"technicalSkills": ["Python", {"name": "Go"}, None, 123]},
        "workExperience": [{"description": "Not a list"}],
    }
    improved = {"additional": {"technicalSkills": ["Python"]}}

    summary, changes = calculate_resume_diff(original, improved)

    removed = [
        c for c in changes if c.field_type == "skill" and c.change_type == "removed"
    ]
    assert [c.original_value for c in removed] == ["Go"]
    assert summary.skills_removed == 1


def test_high_risk_skill_addition() -> None:
    original = {"additional": {"technicalSkills": []}}
    improved = {"additional": {"technicalSkills": ["Rust"]}}

    summary, changes = calculate_resume_diff(original, improved)

    assert summary.high_risk_changes == 1
    assert any(
        c.change_type == "added" and c.field_type == "skill" and c.confidence == "high"
        for c in changes
    )
