# Pull Request Title

Full tailor: JD-based invention, truncation repair, and refiner JD limit

## Related Issue

<!-- If this pull request is related to an issue, please link it here (e.g. #123) -->

## Description

**Prompt/behavior changes in this PR are scoped to the full tailor mode (IMPROVE_RESUME_PROMPT_FULL) only; nudge and keywords prompts are unchanged.**

- **Full tailor:** When the master resume is sparse or missing skills/titles, the LLM may infer skills, responsibilities, and role titles from the job description without contradicting facts (dates, employers, locations, seniority). Added guidance to avoid reusing a single job title across all work experiences.
- **Refiner:** Skills that appear in the tailored resume but not in the master are now reported as **warnings** instead of critical violations, so JD-derived skills are no longer stripped. Job description length used for keyword injection increased from 2000 to 8000 characters.
- **Improver:** When the LLM returns truncated JSON (e.g. missing `personalInfo`), the backend injects minimal placeholders so validation succeeds and the router can restore real personalInfo; avoids 500 on token truncation. Output `max_tokens` set to 8192.

## Type

- [x] Feature Enhancement
- [ ] Bug Fix
- [ ] Documentation Update
- [ ] Code Refactoring
- [ ] Other (please specify):

## Proposed Changes

- `templates.py`: Update `IMPROVE_RESUME_PROMPT_FULL` only (infer from JD when master sparse; distinct job titles per role). No changes to nudge or keywords prompts.
- `refiner.py`: Fabricated-skill severity → warning; `MAX_JD_LENGTH` 2000 → 8000, `MIN_TRUNCATION_WARNING_LENGTH` 1500 → 6000.
- `improver.py`: Add `_repair_truncated_result()` and call before `_check_for_truncation()`; set improve `max_tokens=8192`.

## Screenshots / Code Snippets (if applicable)

N/A

## How to Test

1. Run backend: `cd apps/backend && uv run uvicorn app.main:app --reload --port 8000`.
2. Use a sparse master resume (e.g. minimal or no skills) and run **Full tailor** with a JD that has many skills.
3. Confirm tailored resume keeps JD-derived skills and no 500; if output was previously truncated, confirm personalInfo is restored and no crash.
4. Optionally use a long JD (>2000 chars) and confirm keyword injection still runs (up to 8000 chars).

## Checklist

- [x] The code compiles successfully without any errors or warnings
- [ ] The changes have been tested and verified
- [ ] The documentation has been updated (if applicable)
- [x] The changes follow the project's coding guidelines and best practices
- [x] The commit messages are descriptive and follow the project's guidelines
- [ ] All tests (if applicable) pass successfully
- [ ] This pull request has been linked to the related issue (if applicable)

## Additional Information

Schema/prompt changes are called out above per project workflow. Prompt changes apply only to the full tailor flow (IMPROVE_RESUME_PROMPT_FULL).
