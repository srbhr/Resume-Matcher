# Resume Editor – Maintainer Guide and Next Steps

This guide documents how to work with the resume editor/preview, the Zustand store contracts, types, and PDFs so future changes remain consistent and safe.

## High-level architecture

- Route: `src/app/editor/page.tsx`
  - Header: back link, SaveStatus, Export PDF
  - Split layout: left editor, right live preview
- Editor (tabs): `src/components/resume/resume-editor.tsx`
  - Sections: Personal, Experience, Education, Skills
  - Debounced writes to store (300ms) via `use-auto-save`
- Preview: `src/components/resume/resume-preview.tsx`
  - Subscribes to active resume; A4 aspect ratio; scrollable
- Store: `src/lib/stores/resume-store.ts`
  - Variants list + active selection + granular update/add/remove/reorder actions
- PDF: `src/lib/pdf-export-impl.tsx` (implementation), `src/lib/pdf-export.ts[x]` (shim re-export)

## Key types and contracts

- `src/types/resume-schema.ts`
  - `ResumeJSON` is flexible; known keys include:
    - `id: string` (required)
    - `name?: string`, `title?: string`, `summary?: string`
    - `contact-details?: ContactDetails`
    - `work-experiences?: WorkExperienceEntry[]`
    - `education?: EducationEntry[]`
    - `skills?: Record<string, string[] | string | undefined>`
    - Forward-compatible index signature: `[key: string]: unknown`
  - List entries include optional `_id?: string` to support DnD reordering and stable keys.

### List item types

- `WorkExperienceEntry` fields: `company`, `position`, `duration`, `location`, `employment-type`, `responsibilities?: string[]`, `achievements?: string[]`, `_id?: string`.
- `EducationEntry` fields: `institution`, `degree`, `field`, `graduation-date`, etc., `_id?: string`.

## Zustand store API

File: `src/lib/stores/resume-store.ts`

- Variant management
  - `addResume(partial?) => ResumeJSON`
  - `openResume(id)`
  - `renameResume(id, name)`
  - `updateResume(id, patch)`
  - `removeResume(id)`
  - `getActive() => ResumeJSON | undefined`
- Granular editing (used by the editor)
  - `updateResumeField(id, field: keyof ResumeJSON, value: unknown)`
  - Experience
    - `addExperience(id, experience?: WorkExperienceEntry)`
    - `removeExperience(id, experienceId: string)`
    - `reorderExperience(id, fromIndex: number, toIndex: number)`
  - Education
    - `addEducation(id, entry?: EducationEntry)`
    - `removeEducation(id, entryId: string)`
    - `reorderEducation(id, fromIndex: number, toIndex: number)`
  - Skills
    - `addSkill(id, skill: string, group = 'all')`
    - `removeSkill(id, skill: string, group = 'all')`

Notes:

- `addExperience`/`addEducation` assign an `_id` if not provided.
- Reorder actions move items by indexes safely (bounds-checked).

## Editor patterns

- Debounced writes: use `useAutoSave({ onSave, delayMs: 300 })`
  - Exposes `{ saving, onFieldChange(field, value), forceSave() }`
  - `useSaveStatusStore` global store sets `saving` for header indicator.
- Personal Info: update `contact-details` object and write via `onFieldChange('contact-details', value)`.
- Experience/Education: mutate a local copy of the array, then `updateResumeField(id, 'work-experiences'|'education', next)`.
- DnD: `@dnd-kit` with `_id` keys; reordering calls `reorder*` actions.

## Preview and PDF

- Preview: ensure plain, stable TS types (no `any`). Keep A4 ratio with `aspect-[1/1.4142]`.
- PDF export: call `exportResumePdf(resume)` from header button.
  - Implementation lives in `src/lib/pdf-export-impl.tsx` using `@react-pdf/renderer`.
  - File name: `${firstName}_${lastName}_Resume.pdf` (falls back to `My_Resume.pdf`).

## Adding a new section (example: Certifications)

1. Types: extend `ResumeJSON` with `certifications?: CertificationEntry[]` (already present) and ensure entry includes optional `_id?: string` if reordering is desired.
2. Store actions:
   - Mirror add/remove/reorder as done for experience/education.
3. Editor UI:
   - Create `components/resume/certifications-editor.tsx` with list add/remove + DnD.
   - Wire it in `resume-editor.tsx` tabs; debounce writes like other sections.
4. Preview:
   - Render the section inside `resume-preview.tsx`.
5. PDF:
   - Render the section inside `pdf-export-impl.tsx` mirroring preview layout.
6. Smoke test:
   - Add few items, reorder, export PDF, verify content and order.

## Styling conventions

- Editor panel: `bg-muted/30` + left border separation via `lg:border-r`.
- Preview panel: white/dark background, subtle border and shadow, scroll when overflow.
- Form cards: simple bordered blocks (upgrade to shadcn/ui in future if desired).

## Common pitfalls

- Multiple lockfiles: use one package manager. This repo is PNPM (`packageManager` set). Remove `yarn.lock` to avoid dev-time warnings.
- Turbopack runtime errors: run `next dev` without `--turbopack` if you see SSR runtime chunk issues.
- Type safety: avoid `any`. Use the provided interfaces and `unknown` where needed; cast collections to `WorkExperienceEntry[]`/`EducationEntry[]` when mapping.
- IDs for DnD: ensure `_id` exists on list entries to keep stable keys.

## Maintenance checklist (PRs)

- Types updated for any new fields/sections.
- Store actions added with tests or at least a small local smoke test.
- Editor section created with add/remove/reorder and debounced writes.
- Preview updated to match editor data and order.
- PDF updated to mirror preview.
- Build/lint/typecheck run locally.

## Useful commands

- Dev (no Turbopack): `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Clean state (optional): remove `.next/`, then reinstall via `pnpm install`.

## Variables and data mapping quick ref

- Personal Info → `resume['contact-details']`
- Summary → `resume.summary`
- Experience → `resume['work-experiences']` (array of `WorkExperienceEntry`)
- Education → `resume.education` (array of `EducationEntry`)
- Skills → `resume.skills[group]` (array of strings; default group `all`)

---

If anything gets out of sync (editor vs preview vs PDF), use this guide to trace the flow: Types → Store actions → Editor writes (debounced) → Preview render → PDF render.

## Environment hygiene and Turbopack notes

- Prefer a single package manager. This repo is configured for PNPM. To avoid warnings and edge cases, delete `yarn.lock` and keep `pnpm-lock.yaml`.
- If you hit the Turbopack runtime chunk error (Cannot find module '../chunks/ssr/[turbopack]_runtime.js'):
  - Run dev without Turbopack: `pnpm dev`
  - If you want to re-enable Turbopack:
    1. Clean: remove `.next/`
    2. Ensure only one lockfile exists and install deps fresh: `pnpm install`
    3. Upgrade Next to the latest patch if needed: `pnpm up next`
    4. Start with Turbopack: `next dev --turbopack` (optional)
  - If the error persists, stick to `next dev` (webpack) for stability.
