from app.services.improver import calculate_resume_diff
from app.services.improver import (
    _append_list_changes,
    _match_bullets,
    _tokenize_for_similarity,
    DiffConfidence,
)


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


def test_education_description_change_is_not_duplicated() -> None:
    """Editing only the education description must yield ONE diff, not an extra
    spurious entry-level 'education modified' (regression for the dedup fix)."""
    original = {
        "education": [
            {"institution": "MIT", "degree": "B.S. CS", "years": "2014 - 2018",
             "description": "Graduated with honors"}
        ]
    }
    improved = {
        "education": [
            {"institution": "MIT", "degree": "B.S. CS", "years": "2014 - 2018",
             "description": "Graduated with honors; focus on distributed systems"}
        ]
    }

    _summary, changes = calculate_resume_diff(original, improved)

    education_changes = [c for c in changes if c.field_type == "education"]
    assert len(education_changes) == 1
    assert education_changes[0].field_path == "education[0].description"
    assert education_changes[0].change_type == "modified"


def test_language_add_remove() -> None:
    original = {"additional": {"languages": ["English (Native)"]}}
    improved = {"additional": {"languages": ["English (Native)", "Spanish (Conversational)"]}}

    _summary, changes = calculate_resume_diff(original, improved)

    added = [c for c in changes if c.field_type == "language" and c.change_type == "added"]
    assert [c.new_value for c in added] == ["Spanish (Conversational)"]


def test_language_order_is_ignored() -> None:
    original = {"additional": {"languages": ["English", "Spanish"]}}
    improved = {"additional": {"languages": ["Spanish", "English"]}}

    _summary, changes = calculate_resume_diff(original, improved)

    assert [c for c in changes if c.field_type == "language"] == []


def test_award_add() -> None:
    original = {"additional": {"awards": []}}
    improved = {"additional": {"awards": ["Employee of the Year 2022"]}}

    _summary, changes = calculate_resume_diff(original, improved)

    awards = [c for c in changes if c.field_type == "award" and c.change_type == "added"]
    assert [c.new_value for c in awards] == ["Employee of the Year 2022"]


# --- Bullet-list similarity matching (PR-1 for RM #711) ---
#
# `_append_list_changes` used to run SequenceMatcher on whole-bullet tokens,
# which paired unrelated bullets by position on reorder. These tests lock the
# similarity-based behaviour: reorders don't force `modified`, and bullets
# below the similarity threshold split into add/remove instead of misleading
# side-by-side modifications.

_DEFAULT_CONFIDENCES = DiffConfidence(added="medium", removed="low", modified="medium")


def _describe(field_path: str, original: list[str], improved: list[str]):
    """Small helper: run the list-diff helper and return its output."""
    out: list = []
    _append_list_changes(
        out,
        field_path=field_path,
        field_type="description",
        original_items=original,
        improved_items=improved,
        confidences=_DEFAULT_CONFIDENCES,
    )
    return out


def test_tokenize_is_unicode_case_and_width_insensitive() -> None:
    assert _tokenize_for_similarity("Hello, World!") == ["hello", "world"]
    # Full-width digits normalize via NFKC to ASCII.
    assert _tokenize_for_similarity("ＡＢＣ123") == ["abc123"]
    # CJK: one token per ideograph, no whitespace required.
    assert _tokenize_for_similarity("你好世界") == ["你", "好", "世", "界"]
    # Whitespace only / punctuation only collapse to nothing.
    assert _tokenize_for_similarity("   ") == []
    assert _tokenize_for_similarity("---") == []


def test_lcs_trap_unrelated_bullets_split_into_add_remove() -> None:
    # Issue #711's motivating example: LCS greedily matches "the" and pairs
    # completely unrelated bullets. Similarity matcher must split them.
    original = ["Rewrote the React form validation flow"]
    improved = ["Migrated the visual regression suite to BackstopJS"]

    changes = _describe("workExperience[0].description", original, improved)

    kinds = sorted(c.change_type for c in changes)
    assert kinds == ["added", "removed"]
    assert not any(c.change_type == "modified" for c in changes)


def test_punctuation_only_edit_is_not_suppressed() -> None:
    # cubic review on RM#905: "C++" -> "C#" both tokenize to ["c"], so the old
    # token-equality check treated them as exact and silently dropped the
    # change. Exact must compare normalized SOURCE (punctuation preserved), so
    # a punctuation-only edit lands as a real `modified`.
    original = ["Built high-throughput services in C++"]
    improved = ["Built high-throughput services in C#"]

    changes = _describe("workExperience[0].description", original, improved)

    assert [c.change_type for c in changes] == ["modified"]
    assert "C++" in changes[0].original_value
    assert "C#" in changes[0].new_value


def test_punctuation_only_edit_in_fast_path_is_not_suppressed() -> None:
    # Above the fuzzy backstop (>100 items) the fast path pairs on normalized
    # SOURCE, not tokens, so a C++/C# swap must surface as add/remove instead
    # of being silently exact-matched. Also exercises the O(n) index rewrite
    # of the fast path (cubic #1 on RM#905).
    original = [f"Item {i}" for i in range(120)] + ["Shipped C++ service"]
    improved = [f"Item {i}" for i in range(120)] + ["Shipped C# service"]

    changes = _describe("wp", original, improved)

    assert sorted(c.change_type for c in changes) == ["added", "removed"]
    removed = [c for c in changes if c.change_type == "removed"]
    added = [c for c in changes if c.change_type == "added"]
    assert "C++" in removed[0].original_value
    assert "C#" in added[0].new_value


def test_fast_path_consumes_duplicate_anchors_one_to_one() -> None:
    # Architect review on RM#905: the fast path must consume duplicate
    # normalized keys one-to-one (per-key queue), not keep only the first
    # index. Otherwise an unchanged 121-item duplicate list would emit
    # 120 `added` + 120 `removed`.
    original = ["Wrote unit tests"] * 121
    improved = ["Wrote unit tests"] * 121

    assert _describe("wp", original, improved) == []

    # Count imbalance: the one extra original duplicate falls through to
    # `removed`; nothing else changes.
    original = ["Wrote unit tests"] * 121
    improved = ["Wrote unit tests"] * 120

    changes = _describe("wp", original, improved)
    assert [c.change_type for c in changes] == ["removed"]


def test_whitespace_only_difference_is_not_a_content_change() -> None:
    # Architect review on RM#905: _normalize_source folds whitespace so a
    # spacing/case change is not reported as a content edit.
    original = ["Led  team to deliver"]  # double space
    improved = ["Led team to deliver"]   # single space

    assert _describe("workExperience[0].description", original, improved) == []


def test_identical_pure_punctuation_is_no_diff_in_fuzzy_path() -> None:
    # Architect alignment on RM#905: identical normalized source (incl. pure
    # punctuation, whose token list is empty) must be an exact match in the
    # fuzzy path too. Previously the empty-token skip ran first and swallowed
    # identical "---" into add/remove only here, diverging from the fast path.
    assert _describe("workExperience[0].description", ["---"], ["---"]) == []
    assert _describe(
        "workExperience[0].description",
        ["---", "---", "---"],
        ["---", "---", "---"],
    ) == []


def test_identical_pure_punctuation_is_no_diff_in_fast_path() -> None:
    # Same invariant under the >100 fast path: an unchanged large list with a
    # trailing pure-punctuation bullet produces no diff (guards against the two
    # paths drifting apart again).
    original = [f"Item {i}" for i in range(120)] + ["---"]
    improved = [f"Item {i}" for i in range(120)] + ["---"]

    assert _describe("wp", original, improved) == []


def test_distinct_pure_punctuation_splits_into_add_remove() -> None:
    # Distinct pure-punctuation bullets have no token similarity, so they must
    # NOT pair as a modified edit - they split into add/remove. Checked in both
    # the fuzzy and the fast path so the two stay consistent.
    fuzzy = _describe("workExperience[0].description", ["---"], ["***"])
    assert sorted(c.change_type for c in fuzzy) == ["added", "removed"]

    original = [f"Item {i}" for i in range(120)] + ["---"]
    improved = [f"Item {i}" for i in range(120)] + ["***"]
    fast = _describe("wp", original, improved)
    assert sorted(c.change_type for c in fast) == ["added", "removed"]


def test_pure_reorder_produces_no_records_in_pr1() -> None:
    # PR-1 does not ship the `moved` enum: pure reorders must be silent so
    # the existing frontend does not receive an unknown change_type.
    original = ["Alpha work", "Beta work", "Gamma work"]
    improved = ["Gamma work", "Alpha work", "Beta work"]

    changes = _describe("workExperience[0].description", original, improved)

    assert changes == []


def test_reorder_plus_rewrite_reports_one_modified_and_no_stray_records() -> None:
    original = ["Alpha bullet one", "Beta bullet two", "Gamma bullet three"]
    improved = [
        "Gamma bullet three, rewritten with more detail",  # C reworded
        "Alpha bullet one",                                # A moved
        "Beta bullet two",                                 # B moved
    ]

    changes = _describe("workExperience[0].description", original, improved)

    # Exactly one modified record (for C), no add/remove — A and B are exact
    # reorders and get suppressed in PR-1.
    kinds = sorted(c.change_type for c in changes)
    assert kinds == ["modified"]
    modified = next(c for c in changes if c.change_type == "modified")
    assert modified.original_value == "Gamma bullet three"
    assert modified.new_value == "Gamma bullet three, rewritten with more detail"


def test_unmatched_items_emit_once_each_in_order() -> None:
    original = ["Retired responsibility A", "Kept core work B"]
    improved = ["Kept core work B", "Brand new deliverable C"]

    changes = _describe("workExperience[0].description", original, improved)

    # "Kept core work B" is an exact reorder -> suppressed in PR-1.
    # Only new "C" (added) and old "A" (removed) remain.
    assert [c.change_type for c in changes] == ["added", "removed"]
    assert changes[0].new_value == "Brand new deliverable C"
    assert changes[1].original_value == "Retired responsibility A"


def test_threshold_boundary_and_single_word_bullets() -> None:
    # Short bullets: token ratio alone would drop this, but char ratio saves it.
    changes = _describe("workExperience[0].description", ["Led team"], ["Led squad"])
    assert [c.change_type for c in changes] == ["modified"]

    # Truly unrelated one-word bullets stay split.
    changes = _describe("workExperience[0].description", ["Sales"], ["Cooking"])
    assert sorted(c.change_type for c in changes) == ["added", "removed"]


def test_duplicate_bullets_each_consume_one_slot() -> None:
    # Three identical originals + two identical improved: matcher must pair
    # 2 exactly (silent reorder) and drop the extra original as `removed`.
    original = ["Wrote unit tests", "Wrote unit tests", "Wrote unit tests"]
    improved = ["Wrote unit tests", "Wrote unit tests"]

    changes = _describe("workExperience[0].description", original, improved)

    assert [c.change_type for c in changes] == ["removed"]


def test_non_latin_and_mixed_scripts_pair_correctly() -> None:
    # Chinese bullet slightly reworded — should still pair as modified.
    original = ["负责前端架构设计"]
    improved = ["负责前端架构设计与优化"]

    changes = _describe("workExperience[0].description", original, improved)

    assert [c.change_type for c in changes] == ["modified"]
    assert changes[0].original_value == original[0]
    assert changes[0].new_value == improved[0]

    # Mixed script: casing / width shouldn't produce a false modified.
    original = ["Owned CI/CD pipeline"]
    improved = ["Owned CI/CD pipeline"]
    assert _describe("wp", original, improved) == []


def test_empty_and_large_lists_do_not_raise() -> None:
    assert _describe("wp", [], []) == []
    # Empty original, non-empty improved: everything is added.
    changes = _describe("wp", [], ["New A", "New B"])
    assert [c.change_type for c in changes] == ["added", "added"]

    # Above the fuzzy backstop: only exact anchors, no crash.
    original = [f"Item {i}" for i in range(120)]
    improved = original[::-1]  # pure reversal
    changes = _describe("wp", original, improved)
    assert changes == []  # all exact reorders, suppressed in PR-1


def test_matcher_invariants_indexes_are_one_to_one() -> None:
    original = ["A work", "B work", "C work", "D removed"]
    improved = ["C work rewritten", "A work", "B work", "E added"]

    matches = _match_bullets(original, improved, threshold=0.55)
    old_ids = [m.old_index for m in matches]
    new_ids = [m.new_index for m in matches]
    # No index is consumed twice, and every matched pair references a legal
    # original/improved slot.
    assert len(old_ids) == len(set(old_ids))
    assert len(new_ids) == len(set(new_ids))
    assert all(0 <= i < len(original) for i in old_ids)
    assert all(0 <= j < len(improved) for j in new_ids)


def test_summary_count_matches_similarity_output() -> None:
    # Reorder + one rewrite must land as exactly one `descriptions_modified`.
    original = {
        "workExperience": [
            {"description": ["Old bullet 1", "Old bullet 2", "Old bullet 3"]}
        ]
    }
    improved = {
        "workExperience": [
            {
                "description": [
                    "Old bullet 3 with more impact",
                    "Old bullet 1",
                    "Old bullet 2",
                ]
            }
        ]
    }

    summary, changes = calculate_resume_diff(original, improved)

    modified = [c for c in changes if c.field_type == "description" and c.change_type == "modified"]
    assert len(modified) == 1
    assert summary.descriptions_modified == 1
