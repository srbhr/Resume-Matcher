# Custom prompts for cover letter & cold outreach

**Date:** 2026-04-17
**Issue:** #749
**Branch:** `dev` (bundle into PR with #754 and #751)

## Problem

`COVER_LETTER_PROMPT` and `OUTREACH_MESSAGE_PROMPT` are module constants in `apps/backend/app/prompts/templates.py`. Users want to customize length, style, and content (e.g., "150 words", "include company research", "bold specific keywords"). Currently the only way is to fork the repo.

The resume-generation prompt already supports customization — users pick between three built-in variants ("nudge", "keywords", "full") via the Settings "Prompt Profile" section. That pattern doesn't extend to cover letter / outreach, where users want free-form text override rather than a fixed menu.

## Goals

- User can override the default prompt text for cover letter and cold outreach, per feature.
- Empty / absent override = use default prompt (unchanged behavior).
- Custom prompts must inject the same placeholders as the defaults (`{job_description}`, `{resume_data}`, `{output_language}`); missing placeholders are rejected at save time with a 422.
- UI surfaces the default prompt as placeholder text and offers a "Reset to default" button.
- Resume-generation prompt (which already has variants) is NOT touched in this bucket — deferred.

## Non-goals

- Per-resume prompt overrides (the custom prompt is global).
- Custom prompts for enrichment, refinement, JD matching, or resume title generation.
- Prompt versioning or history.
- Prompt templating beyond the existing `{placeholder}` substitution.

## Design

### Backend

**1. Stored config fields (`config.json`)**

Two new optional top-level string fields:

```json
{
  "cover_letter_prompt": "",
  "outreach_message_prompt": ""
}
```

Empty string = "use default". Absent key = same as empty string.

**2. `Settings` class — intentionally NOT extended**

These overrides are per-deployment user data, not environment config. Leave `apps/backend/app/config.py` alone; load via `_load_stored_config()` at the usage site.

**3. Placeholder validation**

The defaults require `{job_description}` and `{resume_data}` (both are substituted by the services using `.format()`). `{output_language}` is also required. Add a helper in `apps/backend/app/prompts/__init__.py`:

```python
REQUIRED_PLACEHOLDERS = ("{job_description}", "{resume_data}", "{output_language}")


def validate_prompt_placeholders(prompt: str) -> list[str]:
    """Return the list of required placeholders missing from the prompt.

    Empty list means the prompt is valid. Empty-string prompt returns [] (valid
    as "use default" sentinel; validation only runs on non-empty strings in
    the router).
    """
    if not prompt:
        return []
    return [p for p in REQUIRED_PLACEHOLDERS if p not in prompt]
```

The `.format()` call at usage will also fail on missing placeholders, but catching earlier produces a clean 422 with a list of missing names instead of a 500.

**4. Service changes**

`apps/backend/app/services/cover_letter.py`:

```python
from app.llm import _load_stored_config  # or a new public export

async def generate_cover_letter(...):
    ...
    stored = _load_stored_config()
    custom = (stored.get("cover_letter_prompt") or "").strip()
    template = custom or COVER_LETTER_PROMPT
    try:
        prompt = template.format(
            job_description=job_description,
            resume_data=json.dumps(resume_data),
            output_language=output_language,
        )
    except KeyError as e:
        # Defensive: placeholder missing despite save-time validation.
        logging.warning("Custom cover letter prompt missing %s, falling back", e)
        prompt = COVER_LETTER_PROMPT.format(...)
    ...
```

Same shape for `generate_outreach_message`.

`_load_stored_config` in `llm.py` is currently a private helper. Either promote it to a non-underscored export (`load_stored_config`) or move it to `app/config.py` alongside `load_config_file` — the second is cleaner. This spec picks the move.

**5. New API endpoints**

Extend `apps/backend/app/routers/config.py`. The existing router has `/config/prompts` for resume-generation prompt selection. Add two new endpoints scoped to features to keep concerns isolated:

```
GET  /api/v1/config/feature-prompts
     → { cover_letter_prompt, outreach_message_prompt,
         cover_letter_default, outreach_message_default }

PUT  /api/v1/config/feature-prompts
     body: { cover_letter_prompt?, outreach_message_prompt? }
     → same schema as GET
```

The `_default` fields in the GET response let the frontend show the default as placeholder text without duplicating the string across languages.

Validation in the PUT:

```python
if request.cover_letter_prompt is not None:
    prompt = request.cover_letter_prompt.strip()
    if prompt:
        missing = validate_prompt_placeholders(prompt)
        if missing:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "missing_placeholders",
                    "field": "cover_letter_prompt",
                    "missing": missing,
                },
            )
    stored["cover_letter_prompt"] = prompt  # "" clears
# identical block for outreach_message_prompt
```

**6. Schema models (`schemas/models.py`)**

```python
class FeaturePromptsRequest(BaseModel):
    cover_letter_prompt: str | None = None
    outreach_message_prompt: str | None = None


class FeaturePromptsResponse(BaseModel):
    cover_letter_prompt: str
    outreach_message_prompt: str
    cover_letter_default: str
    outreach_message_default: str
```

Note: `str | None = None` on the request distinguishes "no change" from "clear to empty".

### Frontend

**7. API client (`apps/frontend/lib/api/config.ts`)**

```ts
export interface FeaturePrompts {
  cover_letter_prompt: string;
  outreach_message_prompt: string;
  cover_letter_default: string;
  outreach_message_default: string;
}

export interface FeaturePromptsUpdate {
  cover_letter_prompt?: string;
  outreach_message_prompt?: string;
}

export async function fetchFeaturePrompts(): Promise<FeaturePrompts> {...}
export async function updateFeaturePrompts(update: FeaturePromptsUpdate): Promise<FeaturePrompts> {...}
```

**8. Settings UI**

New sub-section under the existing "Content Generation" block. For each of cover letter and outreach, only render the prompt textarea when the feature's toggle is ON (matches existing UX).

For each feature:
- `<label>` "Custom prompt (optional)"
- `<textarea rows={8} className="... font-mono text-xs ...">` — placeholder = default prompt
- Helper line below: "Must include: `{job_description}`, `{resume_data}`, `{output_language}`. Leave blank to use default."
- `<button>` "Reset to default" — clears the textarea AND calls PUT with empty string
- Inline 422 error message below textarea on failed save (lists missing placeholders)

**9. i18n**

New keys in all 5 locales:

```json
{
  "settings": {
    "contentGeneration": {
      "customPromptLabel": "Custom prompt (optional)",
      "customPromptHelp": "Must include: {job_description}, {resume_data}, {output_language}. Leave blank to use default.",
      "customPromptResetButton": "Reset to default",
      "customPromptErrorMissing": "Custom prompt is missing required placeholders: {missing}"
    }
  }
}
```

### Docs

**10. Feature doc**

Short addition to `docs/agent/features/enrichment.md` or a new `docs/agent/features/custom-prompts.md`: explain what can be customized, placeholder requirements, reset behavior.

## Data flow

```
User opens Settings → enables Cover Letter toggle
  ↓
Settings renders textarea with default prompt as placeholder
  ↓
User pastes custom prompt, clicks Save
  ↓
PUT /api/v1/config/feature-prompts { cover_letter_prompt: "..." }
  ↓
Router validates placeholders → 422 on missing OR 200 + persist
  ↓
stored.cover_letter_prompt = "<user text>" OR "" (on clear)
  ↓
Later: user runs Tailor → generates cover letter
  ↓
generate_cover_letter() reads stored config → uses custom or default
  ↓
.format() substitutes placeholders → LLM call → returns text
```

## Error handling

| Failure | Behavior |
|---|---|
| Empty prompt on save | Treated as "clear to default". 200 OK. |
| Prompt missing required placeholder | 422 with `code=missing_placeholders`, lists missing names. No state change. |
| Prompt with extra unknown placeholder | Passes save-time validation. At runtime `.format()` treats unknown braces as literals — harmless if single braces, crashes on `{foo}` style. Defensive try/except in service falls back to default + logs. |
| Stored prompt corrupted (disk edit) | Same defensive try/except. Falls back to default. |

## Files touched

| File | Change |
|---|---|
| `apps/backend/app/config.py` | Move `_load_stored_config` from `llm.py` (rename to public `load_stored_config`), add `save_stored_config` helper |
| `apps/backend/app/llm.py` | Replace private `_load_stored_config` with import of public helper |
| `apps/backend/app/prompts/__init__.py` | New `validate_prompt_placeholders` helper |
| `apps/backend/app/services/cover_letter.py` | Load custom prompt, fall back on error |
| `apps/backend/app/routers/config.py` | Two new endpoints |
| `apps/backend/app/schemas/models.py` | Two new schema classes |
| `apps/frontend/lib/api/config.ts` | New types + fetch/update functions |
| `apps/frontend/app/(default)/settings/page.tsx` | Two new textareas in Content Generation section |
| `apps/frontend/messages/{en,es,ja,zh,pt-BR}.json` | i18n strings |
| `docs/agent/features/custom-prompts.md` (new) | One-page feature doc |

Estimated ~12 files, ~300-400 LOC.

## Risks

- **`_load_stored_config` move breaks existing imports.** There's exactly one external caller inside `apps/backend/app/` — the new service changes. Search + update in the commit.
- **User pastes a very long custom prompt** that inflates token count dramatically. Out of scope to enforce token limits; the LLM-side `max_tokens` and provider limits are the backstop.
- **`.format()` treats `{` as a special character.** If users want a literal brace in their prompt (e.g., documenting JSON schema in-prompt), they need `{{` / `}}`. Noted in helper copy.

## Rollback

Pure additive. Revert:
- Removes the UI textareas (users see feature toggles only, as before).
- Removes the endpoints (404 on next frontend call — would need frontend revert too).
- Stored `cover_letter_prompt` / `outreach_message_prompt` fields in `config.json` become inert — ignored by the reverted service code.

Data is not deleted. Re-enabling the feature restores the stored custom prompts.

## Verification

Manual:
1. Enable Cover Letter toggle in Settings.
2. Leave custom prompt blank; run Tailor; confirm generated cover letter uses default length/style.
3. Paste a valid prompt including all three placeholders with an altered tone ("Write in Shakespearean English, 200 words"); save; run Tailor; confirm output follows custom instructions.
4. Paste a prompt missing `{resume_data}`; save fails with 422 and UI shows "missing placeholders: {resume_data}".
5. Click "Reset to default"; textarea clears; run Tailor; output matches default behavior.
6. Same flow for cold outreach.
