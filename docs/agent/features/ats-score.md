# ATS Score

> **A deterministic ATS-readiness breakdown for a tailored resume, shown in the Tailor review dialog.**

## Overview

`POST /resumes/improve/preview` (and the legacy `POST /resumes/improve`) return an `ats_score` object computed from the tailored resume and the job's extracted keywords. The frontend renders it with `ATSScoreCard` at the top of the scrollable body in `DiffPreviewModal` (both the normal diff view and the missing-diff fallback), so the user sees it before confirming.

The score is **not persisted**: `/improve/confirm` does not return it and it is not stored on the tailored resume.

No LLM calls are made — every component is a pure function in `apps/backend/app/services/ats.py`.

## Sub-scores

| Key | Weight | What it measures |
|-----|--------|------------------|
| `keyword_match` | 40% | Share of JD `required_skills` + `preferred_skills` + `keywords` found as whole words in the resume (`refiner.calculate_keyword_match`) |
| `skills_coverage` | 20% | Share of JD required/preferred skills in `additional.technicalSkills` or the resume text |
| `title_match` | 15% | The posting's exact title (`job_keywords.role`) in `personalInfo.title` → 100; only in `summary` → 75; otherwise word overlap with the headline, scaled to at most 50. Recruiters filter by title literally, so synonyms don't count. |
| `section_completeness` | 15% | 5 checks: contact (email or phone), summary, work experience, education, skills. A section hidden via `sectionMeta[].isVisible = false` does not count. |
| `date_consistency` | 10% | Share of dates (`years` on experience, education, projects, custom-section items) written in the dominant style: `Mon YYYY`, `Mon 'YY`, `YYYY-MM`, `MM/YYYY`, or `YYYY`. Month names match any 3+ letter word, so it works in every content language; "Present"-style markers are ignored. |

`title_match` is `null` when the posting has no title, and `date_consistency` is `null` when the resume has fewer than two dates. A `null` component is excluded from `overall_score`, and its weight is redistributed proportionally across the scored components. The card hides `null` sub-scores instead of showing them as 0%.

Tailoring never edits `personalInfo` (see `_preserve_personal_info`), so a low `title_match` can only be fixed by editing the headline in the Builder. The recommendation text says so.

## Layout warning (frontend only)

The backend doesn't know which template will be exported. The Tailor page captures the stored builder template (`readStoredTemplateSettings().template`) when it requests the preview. `ATSScoreCard` shows a warning when `isTwoColumnTemplate()` (`lib/types/template-settings.ts`) is true: `swiss-two-column`, `modern-two-column`, `vivid`. The warning doesn't change the score.

## Not scored

- Keyword density / stuffing (there is no upper bound; the truthfulness rules in the improve prompts keep the AI from inventing skills).
- Section header wording (headings are localized and user-renamable).
- Export file type (PDFs are text-based Chromium output).

## Files

| Layer | File |
|-------|------|
| Scoring | `apps/backend/app/services/ats.py` |
| Wiring | `apps/backend/app/routers/resumes.py` (`_build_ats_score`) |
| Schema | `apps/backend/app/schemas/models.py` (`ATSSubScores`, `ATSScore`) |
| UI | `apps/frontend/components/tailor/ats-score-card.tsx`, `components/tailor/diff-preview-modal.tsx` |
| i18n | `tailor.atsScore.*` in every `apps/frontend/messages/*.json` |
| Tests | `apps/backend/tests/unit/test_ats.py`, `apps/frontend/tests/diff-preview-modal-ats.test.tsx` |
