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


# --- Certification diffs ---


def test_certification_added() -> None:
    original = {"additional": {"certificationsTraining": ["AWS SAA"]}}
    improved = {"additional": {"certificationsTraining": ["AWS SAA", "CKA"]}}

    summary, changes = calculate_resume_diff(original, improved)

    cert_added = [c for c in changes if c.field_type == "certification" and c.change_type == "added"]
    assert len(cert_added) == 1
    assert cert_added[0].new_value == "CKA"
    assert summary.certifications_added == 1


def test_certification_removed() -> None:
    original = {"additional": {"certificationsTraining": ["AWS SAA", "CKA"]}}
    improved = {"additional": {"certificationsTraining": ["AWS SAA"]}}

    summary, changes = calculate_resume_diff(original, improved)

    cert_removed = [c for c in changes if c.field_type == "certification" and c.change_type == "removed"]
    assert len(cert_removed) == 1
    assert cert_removed[0].original_value == "CKA"


# --- Summary diffs ---


def test_summary_modified() -> None:
    original = {"summary": "Original summary text."}
    improved = {"summary": "Improved summary text."}

    summary, changes = calculate_resume_diff(original, improved)

    summary_changes = [c for c in changes if c.field_type == "summary"]
    assert len(summary_changes) == 1
    assert summary_changes[0].change_type == "modified"


def test_summary_added() -> None:
    original = {"summary": ""}
    improved = {"summary": "New summary."}

    summary, changes = calculate_resume_diff(original, improved)

    summary_changes = [c for c in changes if c.field_type == "summary"]
    assert len(summary_changes) == 1
    assert summary_changes[0].change_type == "added"


def test_summary_removed() -> None:
    original = {"summary": "Has summary."}
    improved = {"summary": ""}

    summary, changes = calculate_resume_diff(original, improved)

    summary_changes = [c for c in changes if c.field_type == "summary"]
    assert len(summary_changes) == 1
    assert summary_changes[0].change_type == "removed"


def test_summary_unchanged() -> None:
    original = {"summary": "Same text."}
    improved = {"summary": "Same text."}

    summary, changes = calculate_resume_diff(original, improved)

    summary_changes = [c for c in changes if c.field_type == "summary"]
    assert len(summary_changes) == 0


# --- Entry-level add/remove/modify ---


def test_experience_entry_added() -> None:
    original = {"workExperience": [{"title": "Dev", "company": "A", "years": "2020", "description": []}]}
    improved = {
        "workExperience": [
            {"title": "Dev", "company": "A", "years": "2020", "description": []},
            {"title": "Senior", "company": "B", "years": "2022", "description": []},
        ]
    }

    summary, changes = calculate_resume_diff(original, improved)

    exp_added = [c for c in changes if c.field_type == "experience" and c.change_type == "added"]
    assert len(exp_added) == 1


def test_experience_entry_removed() -> None:
    original = {
        "workExperience": [
            {"title": "Dev", "company": "A", "years": "2020", "description": []},
            {"title": "Senior", "company": "B", "years": "2022", "description": []},
        ]
    }
    improved = {"workExperience": [{"title": "Dev", "company": "A", "years": "2020", "description": []}]}

    summary, changes = calculate_resume_diff(original, improved)

    exp_removed = [c for c in changes if c.field_type == "experience" and c.change_type == "removed"]
    assert len(exp_removed) == 1


def test_experience_entry_modified() -> None:
    original = {"workExperience": [{"title": "Dev", "company": "A", "location": "NY", "years": "2020", "description": []}]}
    improved = {"workExperience": [{"title": "Dev", "company": "A", "location": "Remote", "years": "2020", "description": []}]}

    summary, changes = calculate_resume_diff(original, improved)

    exp_modified = [c for c in changes if c.field_type == "experience" and c.change_type == "modified"]
    assert len(exp_modified) == 1


def test_project_entry_added() -> None:
    original = {"personalProjects": []}
    improved = {"personalProjects": [{"name": "Tool", "role": "Creator", "years": "2021", "description": []}]}

    summary, changes = calculate_resume_diff(original, improved)

    proj_added = [c for c in changes if c.field_type == "project" and c.change_type == "added"]
    assert len(proj_added) == 1


def test_education_entry_added() -> None:
    original = {"education": []}
    improved = {"education": [{"institution": "MIT", "degree": "BS", "years": "2020", "description": None}]}

    summary, changes = calculate_resume_diff(original, improved)

    edu_added = [c for c in changes if c.field_type == "education" and c.change_type == "added"]
    assert len(edu_added) == 1


def test_no_changes_returns_empty() -> None:
    original = {
        "summary": "Same.",
        "workExperience": [{"title": "Dev", "company": "A", "years": "2020", "description": ["Built stuff"]}],
        "additional": {"technicalSkills": ["Python"], "certificationsTraining": []},
    }
    improved = original.copy()

    summary, changes = calculate_resume_diff(original, improved)

    assert summary.total_changes == 0
    assert len(changes) == 0
