"""Unit tests for refiner pure functions — no LLM calls needed."""

import copy
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services.refiner import (
    analyze_keyword_gaps,
    calculate_keyword_match,
    count_retained_keywords,
    fix_alignment_violations,
    refine_resume,
    remove_ai_phrases,
    validate_master_alignment,
)
from app.schemas.refinement import AlignmentViolation, RefinementConfig


def test_retained_keywords_use_cjk_substrings_and_latin_term_boundaries() -> None:
    resume = {
        "summary": "负责数据分析与Pythonによる開発，熟悉Java开发与JavaScript平台"
    }

    assert count_retained_keywords(
        ["数据", "Python", "Java", "JavaScript"], resume
    ) == 4
    assert count_retained_keywords(
        ["Java", "JavaScript"], {"summary": "负责JavaScript平台开发"}
    ) == 1


async def test_refinement_stats_count_retained_cjk_keyword(
    sample_resume: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    initial = copy.deepcopy(sample_resume)
    master = copy.deepcopy(initial)
    master["additional"]["technicalSkills"].append("数据分析")
    injected = copy.deepcopy(initial)
    injected["additional"]["technicalSkills"].append("数据分析")
    complete = AsyncMock(return_value=injected)
    monkeypatch.setattr("app.services.refiner.complete_json", complete)

    result = await refine_resume(
        initial_tailored=initial,
        master_resume=master,
        job_description="需要数据分析经验",
        job_keywords={"required_skills": ["数据"]},
        config=RefinementConfig(
            enable_ai_phrase_removal=False,
            enable_master_alignment_check=False,
        ),
    )

    assert result.keywords_applied == ["数据"]
    assert result.to_stats().keywords_injected == 1
    assert result.final_match_percentage == 100.0
    complete.assert_awaited_once()


@pytest.mark.parametrize(
    "summary", ["熟悉Java开发", "𠀀Java𰀀", "개발Java개발", "ᄀJavaᄂ"]
)
async def test_refinement_stats_count_latin_keyword_adjacent_to_cjk(
    sample_resume: dict[str, Any], monkeypatch: pytest.MonkeyPatch, summary: str
) -> None:
    initial = copy.deepcopy(sample_resume)
    master = copy.deepcopy(initial)
    master["summary"] = summary
    injected = copy.deepcopy(initial)
    injected["summary"] = summary
    complete = AsyncMock(return_value=injected)
    monkeypatch.setattr("app.services.refiner.complete_json", complete)

    result = await refine_resume(
        initial_tailored=initial,
        master_resume=master,
        job_description="需要熟悉Java开发",
        job_keywords={"required_skills": ["Java"]},
        config=RefinementConfig(
            enable_ai_phrase_removal=False,
            enable_master_alignment_check=False,
        ),
    )

    assert result.keywords_applied == ["Java"]
    assert result.to_stats().keywords_injected == 1
    assert result.final_match_percentage == 100.0
    complete.assert_awaited_once()


@pytest.mark.parametrize(
    "summary", ["𠀀JavaScript𰀀", "개발JavaScript개발", "ᄀJavaScriptᄂ"]
)
def test_cjk_boundaries_do_not_split_latin_terms(summary: str) -> None:
    assert count_retained_keywords(["Java"], {"summary": summary}) == 0


class TestRemoveAiPhrases:
    """Tests for remove_ai_phrases() — local regex replacement."""

    def test_removes_blacklisted_verbs(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["workExperience"][0]["description"][0] = "Spearheaded REST API development"
        cleaned, removed = remove_ai_phrases(data)
        assert "spearheaded" in [r.lower() for r in removed]
        assert "spearheaded" not in cleaned["workExperience"][0]["description"][0].lower()

    def test_removes_buzzwords(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["summary"] = "Leveraged cutting-edge technologies to build robust solutions"
        cleaned, removed = remove_ai_phrases(data)
        removed_lower = [r.lower() for r in removed]
        assert "leveraged" in removed_lower
        assert "cutting-edge" in removed_lower

    def test_protects_jd_phrases(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["summary"] = "Built robust microservices"
        # "robust" is in the blacklist, but if it's in JD, it should be protected
        cleaned, removed = remove_ai_phrases(data, job_description="We need robust solutions")
        assert "robust" not in [r.lower() for r in removed]

    def test_replaces_with_alternatives(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["workExperience"][0]["description"][0] = "Utilized Python for API development"
        cleaned, removed = remove_ai_phrases(data)
        # "utilized" → "used"
        assert "used" in cleaned["workExperience"][0]["description"][0].lower()

    def test_removes_em_dashes(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["summary"] = "Built APIs \u2014 serving thousands of users"
        cleaned, removed = remove_ai_phrases(data)
        assert "\u2014" not in cleaned["summary"]

    def test_no_removal_when_already_clean(self):
        """A resume with no blacklisted terms should have zero removals."""
        clean_data = {
            "summary": "Built APIs with Python.",
            "workExperience": [{"description": ["Wrote code and shipped features"]}],
        }
        cleaned, removed = remove_ai_phrases(clean_data)
        assert len(removed) == 0

    def test_does_not_mutate_input(self, sample_resume):
        data = copy.deepcopy(sample_resume)
        data["summary"] = "Spearheaded development"
        data_before = copy.deepcopy(data)
        remove_ai_phrases(data)
        # The input dict should not be mutated by remove_ai_phrases
        assert data == data_before


class TestValidateMasterAlignment:
    """Tests for validate_master_alignment() — fabrication detection."""

    def test_aligned_when_identical(self, sample_resume, master_resume):
        report = validate_master_alignment(sample_resume, master_resume)
        assert report.is_aligned is True
        assert len(report.violations) == 0

    def test_detects_fabricated_skill(self, sample_resume, master_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["technicalSkills"].append("Kubernetes")
        report = validate_master_alignment(tailored, master_resume)
        skill_violations = [v for v in report.violations if "skill" in v.violation_type]
        assert len(skill_violations) >= 1
        assert any("kubernetes" in v.value.lower() for v in skill_violations)

    def test_allows_jd_added_skill_when_explicitly_allowed(self, sample_resume, master_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["technicalSkills"].append("Kubernetes")
        report = validate_master_alignment(
            tailored,
            master_resume,
            allowed_new_skills={"Kubernetes"},
        )
        critical_skill_violations = [
            v
            for v in report.violations
            if "skill" in v.violation_type and v.severity == "critical"
        ]
        assert critical_skill_violations == []

    async def test_refiner_rejects_skill_from_generic_keyword_only(
        self,
        sample_resume,
        master_resume,
    ):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["technicalSkills"].append("CI/CD")
        result = await refine_resume(
            initial_tailored=tailored,
            master_resume=master_resume,
            job_description="Familiarity with CI/CD pipelines and agile practices",
            job_keywords={
                "required_skills": [],
                "preferred_skills": [],
                "keywords": ["CI/CD"],
            },
            config=RefinementConfig(
                enable_keyword_injection=False,
                enable_ai_phrase_removal=False,
                enable_master_alignment_check=True,
            ),
        )
        assert "CI/CD" not in result.refined_data["additional"]["technicalSkills"]

    async def test_refiner_allows_required_skill_present_in_job_description(
        self,
        sample_resume,
        master_resume,
    ):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["technicalSkills"].append("Kubernetes")
        result = await refine_resume(
            initial_tailored=tailored,
            master_resume=master_resume,
            job_description="Experience with Kubernetes is required.",
            job_keywords={
                "required_skills": ["Kubernetes"],
                "preferred_skills": [],
                "keywords": [],
            },
            config=RefinementConfig(
                enable_keyword_injection=False,
                enable_ai_phrase_removal=False,
                enable_master_alignment_check=True,
            ),
        )
        assert "Kubernetes" in result.refined_data["additional"]["technicalSkills"]

    @pytest.mark.parametrize(
        ("skill", "job_description"),
        [
            ("C++", "Experience with C++ is required for systems tooling."),
            ("C#", "Experience with C# is required for .NET services."),
        ],
    )
    async def test_refiner_allows_required_punctuated_skill_present_in_job_description(
        self,
        sample_resume,
        master_resume,
        skill,
        job_description,
    ):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["technicalSkills"].append(skill)
        result = await refine_resume(
            initial_tailored=tailored,
            master_resume=master_resume,
            job_description=job_description,
            job_keywords={
                "required_skills": [skill],
                "preferred_skills": [],
                "keywords": [],
            },
            config=RefinementConfig(
                enable_keyword_injection=False,
                enable_ai_phrase_removal=False,
                enable_master_alignment_check=True,
            ),
        )
        assert skill in result.refined_data["additional"]["technicalSkills"]

    def test_detects_fabricated_certification(self, sample_resume, master_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["certificationsTraining"].append("Google Cloud Professional")
        report = validate_master_alignment(tailored, master_resume)
        cert_violations = [v for v in report.violations if v.violation_type == "fabricated_cert"]
        assert len(cert_violations) >= 1

    def test_detects_fabricated_company(self, sample_resume, master_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["workExperience"].append({
            "id": 3,
            "title": "Engineer",
            "company": "FakeCompany Inc",
            "years": "2015 - 2017",
            "description": ["Did things"],
        })
        report = validate_master_alignment(tailored, master_resume)
        company_violations = [v for v in report.violations if v.violation_type == "fabricated_company"]
        assert len(company_violations) >= 1

    def test_allows_skill_variants_as_non_critical(self, sample_resume, master_resume):
        """A variant of an existing skill (e.g. 'Python 3') should be info, not critical."""
        tailored = copy.deepcopy(sample_resume)
        # Master has "Python", tailored adds "Python 3" — substring match should be non-critical
        tailored["additional"]["technicalSkills"].append("Python 3")
        report = validate_master_alignment(tailored, master_resume)
        python3_violations = [
            v for v in report.violations
            if "python 3" in v.value.lower()
        ]
        # Should be info/variant, NOT critical fabricated_skill
        for v in python3_violations:
            assert v.severity != "critical" or v.violation_type == "skill_variant"

    def test_confidence_decreases_with_violations(self, sample_resume, master_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["technicalSkills"].extend(["Kotlin", "Scala", "Haskell"])
        report = validate_master_alignment(tailored, master_resume)
        assert report.confidence_score < 1.0


class TestFixAlignmentViolations:
    """Tests for fix_alignment_violations() — removing fabricated content."""

    def test_removes_fabricated_skill(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["technicalSkills"].append("FakeSkill")
        violations = [
            AlignmentViolation(
                field_path="additional.technicalSkills",
                violation_type="fabricated_skill",
                value="FakeSkill",
                severity="critical",
            )
        ]
        fixed = fix_alignment_violations(tailored, violations)
        assert "FakeSkill" not in fixed["additional"]["technicalSkills"]

    def test_removes_fabricated_cert(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        tailored["additional"]["certificationsTraining"].append("Fake Cert")
        violations = [
            AlignmentViolation(
                field_path="additional.certificationsTraining",
                violation_type="fabricated_cert",
                value="Fake Cert",
                severity="critical",
            )
        ]
        fixed = fix_alignment_violations(tailored, violations)
        assert "Fake Cert" not in fixed["additional"]["certificationsTraining"]

    def test_skips_non_critical_violations(self, sample_resume):
        tailored = copy.deepcopy(sample_resume)
        original_skills = list(tailored["additional"]["technicalSkills"])
        violations = [
            AlignmentViolation(
                field_path="additional.technicalSkills",
                violation_type="skill_variant",
                value="Python",
                severity="info",
            )
        ]
        fixed = fix_alignment_violations(tailored, violations)
        assert fixed["additional"]["technicalSkills"] == original_skills


class TestAnalyzeKeywordGaps:
    """Tests for analyze_keyword_gaps() — keyword matching analysis."""

    def test_finds_missing_keywords(self, sample_resume, master_resume, sample_job_keywords):
        analysis = analyze_keyword_gaps(sample_job_keywords, sample_resume, master_resume)
        # "Kubernetes" is in required_skills but not in the resume
        assert "Kubernetes" in analysis.missing_keywords

    def test_identifies_injectable_vs_non_injectable(self, sample_resume, master_resume, sample_job_keywords):
        analysis = analyze_keyword_gaps(sample_job_keywords, sample_resume, master_resume)
        # Every keyword lands in exactly one bucket
        all_jd = set(sample_job_keywords["required_skills"] + sample_job_keywords["preferred_skills"] + sample_job_keywords["keywords"])
        present = all_jd - set(analysis.missing_keywords)
        injectable = set(analysis.injectable_keywords)
        non_injectable = set(analysis.non_injectable_keywords)
        # Missing = injectable + non-injectable (no overlap)
        assert injectable | non_injectable == set(analysis.missing_keywords)
        assert injectable & non_injectable == set()
        # Present + missing = all keywords
        assert present | set(analysis.missing_keywords) == all_jd

    def test_calculates_match_percentage(self, sample_resume, master_resume, sample_job_keywords):
        analysis = analyze_keyword_gaps(sample_job_keywords, sample_resume, master_resume)
        assert 0.0 <= analysis.current_match_percentage <= 100.0
        assert analysis.potential_match_percentage >= analysis.current_match_percentage

    def test_keyword_already_present(self, sample_resume, master_resume):
        keywords = {"required_skills": ["Python"], "preferred_skills": [], "keywords": []}
        analysis = analyze_keyword_gaps(keywords, sample_resume, master_resume)
        assert "Python" not in analysis.missing_keywords
        assert analysis.current_match_percentage == 100.0


class TestCalculateKeywordMatch:
    """Tests for calculate_keyword_match() — percentage calculation."""

    def test_returns_percentage(self, sample_resume, sample_job_keywords):
        pct = calculate_keyword_match(sample_resume, sample_job_keywords)
        assert 0.0 <= pct <= 100.0

    def test_returns_zero_for_no_keywords(self, sample_resume):
        pct = calculate_keyword_match(sample_resume, {"required_skills": [], "preferred_skills": [], "keywords": []})
        assert pct == 0.0

    def test_returns_100_when_all_present(self, sample_resume):
        # Use keywords that are definitely in the resume
        keywords = {"required_skills": ["Python", "FastAPI"], "preferred_skills": [], "keywords": []}
        pct = calculate_keyword_match(sample_resume, keywords)
        assert pct == 100.0

    def test_word_boundary_matching(self, sample_resume):
        """'Go' should not match 'Google' or 'going'."""
        keywords = {"required_skills": ["Go"], "preferred_skills": [], "keywords": []}
        pct = calculate_keyword_match(sample_resume, keywords)
        # "Go" is not in the sample resume as a standalone word
        assert pct == 0.0


class TestPreserveDescriptionStyles:
    """H-04: descriptionStyles must survive the keyword-injection pass.

    inject_keywords returns the model's JSON verbatim after only a top-level
    structure check, and it is the LAST writer on the improve path. When the
    model drops descriptionStyles, ResumeData backfills every row to "bullet",
    silently erasing the user's "plain" rows. Prompt instructions alone are not
    a guarantee for positional metadata, so a local restore runs after.
    """

    def test_restores_styles_the_llm_dropped(self):
        from app.services.refiner import _preserve_description_styles

        original = {
            "workExperience": [
                {
                    "description": ["Led migration", "Cut costs 40%"],
                    "descriptionStyles": ["plain", "bullet"],
                }
            ]
        }
        improved = {
            "workExperience": [
                {"description": ["Led the platform migration", "Reduced costs by 40%"]}
            ]
        }

        out = _preserve_description_styles(original, improved)

        assert out["workExperience"][0]["descriptionStyles"] == ["plain", "bullet"]

    def test_pads_when_the_llm_added_a_row(self):
        from app.services.refiner import _preserve_description_styles

        original = {
            "workExperience": [
                {"description": ["A"], "descriptionStyles": ["plain"]}
            ]
        }
        improved = {"workExperience": [{"description": ["A improved", "B new"]}]}

        out = _preserve_description_styles(original, improved)

        assert out["workExperience"][0]["descriptionStyles"] == ["plain", "bullet"]

    def test_trusts_a_correctly_aligned_list_from_the_model(self):
        from app.services.refiner import _preserve_description_styles

        original = {
            "workExperience": [
                {"description": ["A", "B"], "descriptionStyles": ["plain", "plain"]}
            ]
        }
        improved = {
            "workExperience": [
                {"description": ["A", "B"], "descriptionStyles": ["bullet", "plain"]}
            ]
        }

        out = _preserve_description_styles(original, improved)

        # The model returned an aligned list; it is deliberate output, not loss.
        assert out["workExperience"][0]["descriptionStyles"] == ["bullet", "plain"]

    def test_covers_projects_and_custom_sections(self):
        """customSections is a dict keyed by section id, not a list.

        The first version of this test built it as a list, which made the
        assertion pass against a branch that never executed. The shape here
        matches ResumeData.customSections: dict[str, CustomSection].
        """
        from app.services.refiner import _preserve_description_styles

        original = {
            "personalProjects": [
                {"description": ["P1"], "descriptionStyles": ["plain"]}
            ],
            "customSections": {
                "custom_1": {
                    "sectionType": "itemList",
                    "items": [
                        {"description": ["C1"], "descriptionStyles": ["plain"]}
                    ],
                }
            },
        }
        improved = {
            "personalProjects": [{"description": ["P1 reworded"]}],
            "customSections": {
                "custom_1": {
                    "sectionType": "itemList",
                    "items": [{"description": ["C1 reworded"]}],
                }
            },
        }

        out = _preserve_description_styles(original, improved)

        assert out["personalProjects"][0]["descriptionStyles"] == ["plain"]
        assert out["customSections"]["custom_1"]["items"][0]["descriptionStyles"] == [
            "plain"
        ]

    def test_matches_custom_sections_by_key_not_position(self):
        """Dict ordering is not part of the contract, so match by key."""
        from app.services.refiner import _preserve_description_styles

        original = {
            "customSections": {
                "alpha": {"items": [{"description": ["A"], "descriptionStyles": ["plain"]}]},
                "beta": {"items": [{"description": ["B"], "descriptionStyles": ["bullet"]}]},
            }
        }
        # Same sections, reversed insertion order.
        improved = {
            "customSections": {
                "beta": {"items": [{"description": ["B reworded"]}]},
                "alpha": {"items": [{"description": ["A reworded"]}]},
            }
        }

        out = _preserve_description_styles(original, improved)

        assert out["customSections"]["alpha"]["items"][0]["descriptionStyles"] == ["plain"]
        assert out["customSections"]["beta"]["items"][0]["descriptionStyles"] == ["bullet"]

    def test_keyword_injection_prompt_carries_the_preserve_rule(self):
        """The local net is defence-in-depth; the prompt should still ask."""
        from app.prompts.refinement import KEYWORD_INJECTION_PROMPT

        assert "descriptionStyles" in KEYWORD_INJECTION_PROMPT
