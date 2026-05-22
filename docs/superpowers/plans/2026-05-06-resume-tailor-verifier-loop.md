# Resume Tailor Verifier Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make full resume tailoring add JD-aligned skills and improve work/project wording through smaller structured LLM passes guarded by local verification.

**Architecture:** Keep the existing diff-based safety model, but split planning from editing. A first LLM call produces skill targets, a local verifier filters and classifies them, then the existing diff call receives the verified target plan and can append allowed JD skills while rewriting summary, work, and project bullets around those targets.

**Tech Stack:** Python 3.13, FastAPI, Pydantic v2, LiteLLM via `complete_json()`, pytest

---

## File Map

| File | Responsibility | Change |
|------|----------------|--------|
| `apps/backend/app/schemas/models.py` | Diff action model | Add `add_skill` action support |
| `apps/backend/app/prompts/templates.py` | LLM instructions | Add skill planning prompt and expand diff prompt with verified targets |
| `apps/backend/app/prompts/__init__.py` | Prompt exports | Export the planning prompt |
| `apps/backend/app/services/improver.py` | Tailoring harness | Add skill-plan generation, verifier, prompt wiring, `add_skill` applier |
| `apps/backend/tests/unit/test_apply_diffs.py` | Diff applier coverage | Add add-skill pass/reject tests |
| `apps/backend/tests/service/test_improver.py` | LLM prompt harness coverage | Add skill-plan parser/verifier and prompt wiring tests |

## Tasks

### Task 1: Add Verified Skill Additions

- [ ] Write failing tests proving `apply_diffs()` can append a new skill through `action="add_skill"` and reject duplicates/empty values.
- [ ] Update `ResumeChange.action` to include `add_skill`.
- [ ] Implement `add_skill` in `apply_diffs()` for `additional.technicalSkills` only.
- [ ] Run the focused unit tests.

### Task 2: Build and Verify a Skill Target Plan

- [ ] Write failing service tests for parsing LLM skill-plan output.
- [ ] Add `SKILL_TARGET_PLAN_PROMPT`.
- [ ] Add `generate_skill_target_plan()` using `complete_json(schema_type="skill_plan")`.
- [ ] Add `verify_skill_target_plan()` that keeps existing skills, allows JD-added skills, and rejects unsupported non-JD items.
- [ ] Run the focused service tests.

### Task 3: Wire Verified Targets into Diff Generation

- [ ] Write a failing test proving `generate_resume_diffs()` includes verified skill targets in the prompt and advertises `add_skill`.
- [ ] Pass `skill_targets` into `generate_resume_diffs()`.
- [ ] Expand `DIFF_IMPROVE_PROMPT` so full tailor can add verified JD skills and improve work/project bullets around them.
- [ ] In `_improve_preview_flow()`, run the plan before diff generation and feed verified targets into the diff pass.
- [ ] Run backend unit/service tests for improver, diff applier, and refiner.

### Task 4: Verify the Preview Path

- [ ] Run backend focused tests.
- [ ] Run frontend lint if frontend files changed; otherwise skip and state why.
- [ ] Report the exact commands and outcomes.
