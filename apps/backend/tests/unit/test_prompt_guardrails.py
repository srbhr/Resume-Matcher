"""Content guards on the tailoring prompts.

Two invariants this locks:
1. JD-keyword incorporation is the DEFAULT across sections (the maintainer goal).
2. The anti-fabrication clauses stay present. Deterministic final-output
   preservation handles structural loss and unsupported metrics, while weakly
   grounded narrative is held for explicit review. These prompt clauses remain
   the model-facing first layer and should not regress.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.prompts.refinement import KEYWORD_INJECTION_PROMPT
from app.prompts.templates import (
    COVER_LETTER_PROMPT,
    DIFF_IMPROVE_PROMPT,
    INTERVIEW_PREP_PROMPT,
)
from app.services.cover_letter import generate_cover_letter


class TestJdIncorporationIsDefault:
    def test_diff_prompt_reframes_by_default(self):
        assert "By DEFAULT" in DIFF_IMPROVE_PROMPT
        assert "reframe" in DIFF_IMPROVE_PROMPT.lower()

    def test_keyword_injection_targets_every_section_by_default(self):
        assert "EVERY section" in KEYWORD_INJECTION_PROMPT
        assert "DEFAULT" in KEYWORD_INJECTION_PROMPT

    def test_cover_letter_reframes_in_jd_terminology(self):
        assert "terminology" in COVER_LETTER_PROMPT.lower()


class TestCoverLetterWritingApproach:
    @pytest.mark.parametrize("custom", ["", "broken {missing}", "broken {"])
    async def test_generator_formats_default_and_fallback_with_source_data(
        self, custom: str
    ) -> None:
        resume = {"summary": "Built Python APIs serving 50K requests/day {verified}"}
        job = "Backend engineer at Acme: improve API reliability {platform}"
        with (
            patch(
                "app.services.cover_letter.load_config_file",
                return_value={"cover_letter_prompt": custom},
            ),
            patch(
                "app.services.cover_letter.complete",
                new_callable=AsyncMock,
                return_value="  Letter body\n",
            ) as complete,
        ):
            result = await generate_cover_letter(resume, job, "es")

        assert result == "Letter body"
        complete.assert_awaited_once()
        assert complete.call_args.kwargs["prompt"] == COVER_LETTER_PROMPT.format(
            resume_data=json.dumps(resume),
            job_description=job,
            output_language="Spanish",
        )

    async def test_generator_preserves_custom_prompt_override(self) -> None:
        custom = "Custom style: {resume_data}\n{job_description}\n{output_language}"
        with (
            patch(
                "app.services.cover_letter.load_config_file",
                return_value={"cover_letter_prompt": custom},
            ),
            patch(
                "app.services.cover_letter.complete",
                new_callable=AsyncMock,
                return_value="Letter",
            ) as complete,
        ):
            await generate_cover_letter({"summary": "API engineer"}, "Acme role", "en")

        assert (
            complete.call_args.kwargs["prompt"]
            == 'Custom style: {"summary": "API engineer"}\nAcme role\nEnglish'
        )

    def test_uses_specific_four_part_structure(self) -> None:
        assert "Opening hook" in COVER_LETTER_PROMPT
        assert "Match paragraph" in COVER_LETTER_PROMPT
        assert "Company-fit paragraph" in COVER_LETTER_PROMPT
        assert "Closing" in COVER_LETTER_PROMPT
        assert "under one page" in COVER_LETTER_PROMPT
        assert "3-4 concise paragraphs" in COVER_LETTER_PROMPT

    def test_selects_evidence_instead_of_rehashing_resume(self) -> None:
        assert "two or three strongest evidence-backed matches" in COVER_LETTER_PROMPT
        assert "measurable results when the resume provides them" in COVER_LETTER_PROMPT
        assert "instead of rehashing resume bullets" in COVER_LETTER_PROMPT

    def test_requires_specific_company_fit_without_fake_research(self) -> None:
        assert (
            "product, mission, project, customer, culture signal, or challenge"
            in COVER_LETTER_PROMPT
        )
        assert "instead of inventing research" in COVER_LETTER_PROMPT
        assert "generic flattery" in COVER_LETTER_PROMPT

    def test_calibrates_region_tone_and_special_circumstances(self) -> None:
        assert "US, UK, or AU/NZ" in COVER_LETTER_PROMPT
        assert "match its tone" in COVER_LETTER_PROMPT
        assert (
            "career transition, employment gap, overqualification, or underqualification"
            in COVER_LETTER_PROMPT
        )

    def test_avoids_generic_opening_and_uses_safe_greeting(self) -> None:
        assert (
            'Never open with "I am writing to express my interest"'
            in COVER_LETTER_PROMPT
        )
        assert 'otherwise use "Dear Hiring Manager"' in COVER_LETTER_PROMPT
        assert "Never invent a name" in COVER_LETTER_PROMPT


class TestAntiFabricationClausesPresent:
    def test_diff_prompt_keeps_no_invented_work_clauses(self):
        # rule 11's reframe permission must ship WITH its anti-fabrication clause
        assert (
            "Do NOT add new work, metrics, or responsibilities" in DIFF_IMPROVE_PROMPT
        )
        # rule 2 must remain
        assert (
            "Do not invent metrics or achievements not supported by the original resume"
            in DIFF_IMPROVE_PROMPT
        )

    def test_keyword_injection_keeps_no_invent_clauses(self):
        assert (
            "do not invent new content, metrics, or work history"
            in KEYWORD_INJECTION_PROMPT
        )
        assert (
            "Do NOT add skills, technologies, or certifications not in the master resume"
            in KEYWORD_INJECTION_PROMPT
        )

    def test_cover_letter_keeps_no_invent_clauses(self):
        assert (
            "Do NOT invent experience, skills, metrics, motivations, company facts"
            in COVER_LETTER_PROMPT
        )
        assert "proven experience supports it" in COVER_LETTER_PROMPT

    def test_interview_prep_keeps_no_fabrication_guardrails(self):
        assert "Do NOT invent experience" in INTERVIEW_PREP_PROMPT
        assert (
            "tools, employers, metrics, certifications, skills" in INTERVIEW_PREP_PROMPT
        )
        assert "Skill gaps are preparation targets only" in INTERVIEW_PREP_PROMPT
        assert "Do NOT translate JSON property names" in INTERVIEW_PREP_PROMPT
        assert "role_fit_analysis" in INTERVIEW_PREP_PROMPT
        assert "talking_points" in INTERVIEW_PREP_PROMPT
