# ATS Score

> **A deterministic ATS-readiness breakdown for a tailored resume, shown in the Tailor review dialog and kept as the last calculated score in the Builder.**

## Overview

`POST /resumes/improve/preview` (and the legacy `POST /resumes/improve`) return an `ats_score` object computed from the tailored resume and the job's extracted keywords. The frontend renders it with `ATSScoreCard` at the top of the scrollable body in `DiffPreviewModal` (both the normal diff view and the missing-diff fallback), so the user sees it before confirming.

When a preview is **confirmed**, the score of the confirmed resume is calculated again and stored as its *last calculated* score. It is stored on the tailored resume's job link (`improvements.ats_score`, JSON `{score, calculated_at}`), not on the resume row, so the resume's `updated_at` doesn't change.

## Last calculated score and recalculation

| Endpoint | Returns |
|----------|---------|
| `GET /api/v1/resumes/{id}/ats-score` | `ATSScoreRecord` `{score, calculated_at}`: the stored last score. `404` when it was never calculated (e.g. resumes tailored before this feature). |
| `POST /api/v1/resumes/{id}/ats-score` | Recalculates from the resume's **current saved** `processed_data`, stores the result as the new last score, and returns it. |

Both endpoints return `400` when the resume is not tailored (no `parent_id`), and `404` for an unknown resume or a resume with no linked job.

Recalculation makes no LLM call. It uses:

- the job keywords cached on the job (`job_keywords`, valid only while `job_keywords_hash` matches the job content);
- the master, found by `_grounding_master_data`, for the missing vs injectable split (`analyze_keyword_gaps`).

It returns `409` when the keywords are missing or stale, or the resume has no structured data. Confirmation uses the same helper (`_score_tailored_data`) and skips scoring silently when the keywords aren't cached. The preview's score is calculated before keyword injection (`refine_resume`), so the stored score can differ slightly from the one shown in the review dialog.

The Builder's **JD Match** tab shows the last score in the left panel (`components/builder/ats-score-panel.tsx`), with its calculation time and a **Recalculate** button. The button is disabled while the builder has unsaved changes, because recalculation scores the saved version. A failed recalculation keeps the last score on screen. Duplicating a tailored resume does not copy its score; recalculate on the copy.

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
| Endpoints | `apps/backend/app/routers/resumes.py` (`get_ats_score_for_resume`, `recalculate_ats_score_for_resume`, `_score_tailored_data`) |
| Storage | `Improvement.ats_score` (`apps/backend/app/models.py`), migration in `db_engine.py`, `Database.set_ats_score` |
| UI | `apps/frontend/components/tailor/ats-score-card.tsx`, `components/tailor/diff-preview-modal.tsx`, `components/builder/ats-score-panel.tsx` |
| API client | `fetchLastAtsScore`, `recalculateAtsScore` in `apps/frontend/lib/api/resume.ts` |
| i18n | `tailor.atsScore.*` in every `apps/frontend/messages/*.json` |
| Tests | `apps/backend/tests/unit/test_ats.py`, `apps/backend/tests/integration/test_ats_score_api.py`, `apps/backend/tests/unit/test_ats_score_migration.py`, `test_bullet_selection_flow.py::test_confirm_saves_the_ats_score_as_last_calculated`, `apps/frontend/tests/diff-preview-modal-ats.test.tsx`, `apps/frontend/tests/ats-score-panel.test.tsx` |
