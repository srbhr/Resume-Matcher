# CLAUDE.md - Frontend (apps/frontend)

> Frontend deep-dive for Claude Code. Read the repo-root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) and [`docs/agent/README.md`](../../docs/agent/README.md) first for project-wide context. This file goes deeper on the Next.js app only.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS v4 · no UI framework (hand-rolled `components/ui`). Import alias `@/*` → `apps/frontend/*`.

---

## Route / Page Map

App Router under `app/`. A `(default)` route group wraps the main app in providers; `print/*` is provider-free (server-rendered for headless-Chromium PDF capture).

| Route | File | Type | Purpose |
|-------|------|------|---------|
| `/` | `app/(default)/page.tsx` | Server | Landing — renders `<Hero/>` |
| `/dashboard` | `app/(default)/dashboard/page.tsx` | Client | Resume list, upload, delete, retry, status grid |
| `/builder` | `app/(default)/builder/page.tsx` | Client wrapper → `components/builder/resume-builder.tsx` | Master-resume editor (forms, drag-drop sections, templates, AI regenerate, cover letter / outreach) |
| `/tailor` | `app/(default)/tailor/page.tsx` | Client | Paste JD → preview/confirm tailored resume (diff modal) |
| `/tracker` | `app/(default)/tracker/page.tsx` | Client | Kanban application tracker — 7-column board (drag/drop, bulk ops, manual add) |
| `/settings` | `app/(default)/settings/page.tsx` | Client | LLM provider/model/key, per-provider API keys, features, prompts, language, reset DB |
| `/resumes/[id]` | `app/(default)/resumes/[id]/page.tsx` | Client | View one resume, download PDF, rename, enrichment modal |
| `/print/resumes/[id]` | `app/print/resumes/[id]/page.tsx` | **Server** | Print-only resume render for PDF (reads `searchParams` for template settings + `lang`) |
| `/print/cover-letter/[id]` | `app/print/cover-letter/[id]/page.tsx` | **Server** | Print-only cover-letter render for PDF |

`app/layout.tsx` (root) wires fonts (Space Grotesk for the label face, Noto Sans SC/KR/JP as CJK fallbacks for resume content), the `theme-color` viewport meta (`lib/theme-color.ts`, kept equal to Canvas by a test) and global CSS. `app/(default)/layout.tsx` nests providers: `StatusCacheProvider` → `LanguageProvider` → `ResumePreviewProvider` → `LocalizedErrorBoundary` → `MotionProvider`.

> Most pages are `'use client'`. The `print/*` pages are intentionally server components and fetch from the backend directly via `API_BASE` + `lib/i18n/server.ts` (`translate`). Do not add `'use client'` to them.

---

## Directory Layout

```
app/                 # routes (see table)
components/
  ui/                # primitives: button (+ buttonClass), input, textarea, label,
                     #   dialog, confirm-dialog, link-dialog, dropdown, card,
                     #   retro-tabs, toggle-switch, segmented-control, alert,
                     #   status-indicator, panel-header, empty-state, page-frame,
                     #   page-header, rich-text-editor (Tiptap), rich-text-toolbar
  builder/           # builder page UI + forms/ (per-section form components)
  dashboard/         # resume list/card, upload dialog
  tailor/            # diff-preview-modal
  tracker/           # kanban-board, kanban-column, application-card,
                     #   card-detail-modal, bulk-action-bar,
                     #   manual-add-application-dialog, reorder.ts (pure planMove)
  enrichment/        # AI enrichment wizard modal/steps
  resume/            # resume render templates (single/two-column, modern) + styles/*.module.css
  preview/           # paginated A4/Letter preview (use-pagination.ts)
  home/              # hero, swiss-grid
  settings/          # api-key-menu
  common/            # error-boundary, resume_previewer_context, motion-provider,
                     #   motion-features, presence (FadePresence/FadeItem),
                     #   llm-setup-alert, default-badge
lib/
  api/               # backend client (see Data Flow)
  i18n/              # translation engine (see i18n)
  context/           # status-cache, language-context
  motion.ts          # EASE_OUT_EXPO, DURATION, SPRING (the motion vocabulary)
  format-date.ts     # formatDate(value, locale) — the one date formatter
  theme-color.ts     # THEME_COLOR (= Canvas)
  utils/             # download, html-sanitizer, keyword-matcher, section-helpers
  types/             # template-settings, lucide.d.ts
  config/version.ts  # APP_VERSION / codename
  constants/page-dimensions.ts
hooks/               # use-file-upload, use-regenerate-wizard, use-enrichment-wizard
i18n/config.ts       # locale list + names/flags (NOTE: distinct from lib/i18n)
messages/            # en/es/zh/ja/pt-BR JSON (see i18n)
tests/               # vitest (see Testing)
```

---

## Data Flow (page → hook → lib/api → backend)

All backend calls go through **`lib/api/`** — never call `fetch` to the backend directly from a component.

- `lib/api/client.ts` — single source of truth. Exports `apiFetch / apiPost / apiPatch / apiPut / apiDelete`, `API_URL`, `API_BASE`, `getUploadUrl()`.
  - Base URL: `NEXT_PUBLIC_API_URL` (default `'/'`) → `API_BASE` becomes `/api/v1`. On the **server** a `/`-relative base is rewritten to `http://127.0.0.1:8000/api/v1` (`INTERNAL_API_ORIGIN`); browser uses the relative path (proxied by `next.config.ts` rewrites to `BACKEND_ORIGIN`).
  - Default request timeout **240_000ms** (matches backend `wait_for` hard limit). `AbortError` → friendly "Request timed out" message.
- `lib/api/resume.ts` — resumes/jobs: upload, improve / improve.preview / improve.confirm, fetch, list, update (PATCH), PDF URLs + blob download, delete, cover-letter / outreach generate+update, rename, retry-processing, fetch JD.
- `lib/api/config.ts` — LLM config, `testLlmConnection`, system `/status`, feature flags, prompt config, **feature prompts** (`FeaturePromptsError` for 422 `missing_placeholders`), **per-provider API-key management** (each provider's key persists independently — switching the active provider no longer wipes another's; stored encrypted server-side), language config, `resetDatabase`. `PROVIDER_INFO` lists supported providers + default models.
- `lib/api/enrichment.ts` — AI enrichment (analyze/enhance/apply) and AI regenerate (regenerate/apply-regenerated).
- `lib/api/tracker.ts` — application-tracker CRUD/bulk over `apiFetch/apiPost/apiPatch/apiDelete`: grouped list, detail (JD + resume), manual add, status/position/notes PATCH, bulk move, delete, bulk-delete.
- `lib/api/index.ts` — barrel re-export (note: not everything is re-exported; some functions are imported from `./resume` / `./config` / `./enrichment` directly).

**Contracts:** `lib/api/*` interfaces mirror backend Pydantic schemas. See [front-end-apis.md](../../docs/agent/apis/front-end-apis.md) and [api-flow-maps.md](../../docs/agent/apis/api-flow-maps.md).

**Shared client state (React Context, not a fetch lib):**
- `StatusCacheProvider` (`lib/context/status-cache.tsx`) — caches `/status` (LLM health 30min, DB stats 5min stale), with optimistic counter updates. Use `useStatusCache()` / `useIsStatusStale()`.
- `LanguageProvider` (`lib/context/language-context.tsx`) — UI + content language, localStorage + backend sync. Use `useLanguage()`.

> The **tracker board owns its state locally** — `components/tracker/kanban-board.tsx` holds the columns in `useState` and owns the single `@dnd-kit` `DndContext`. There is **no** `TrackerProvider` / tracker context; don't look for one.

---

## i18n — READ THIS BEFORE TOUCHING TRANSLATIONS

Two distinct settings, configured independently in Settings:
- **UI language** — interface text, client-only (`uiLanguage`, localStorage).
- **Content language** — language the LLM writes resumes/cover letters in (`contentLanguage`, persisted to backend).

**Supported locales (source of truth = `i18n/config.ts`):** `en`, `es`, `zh`, `ja`, `pt` (the file is `messages/pt-BR.json`, imported as `pt`). The `docs/agent/features/i18n.md` table is stale — it omits `pt`; trust the code.

Engine (no external i18n lib, plain JSON):
- `i18n/config.ts` — `locales`, `defaultLocale='en'`, `localeNames`, `localeFlags`.
- `lib/i18n/messages.ts` — static-imports every locale JSON; the critical types live here.
- `lib/i18n/translations.ts` — `useTranslations()` returns `{ t, messages, locale }`; `t('a.b.c', params)` does dot-path lookup + `{placeholder}` substitution. Missing key returns the key string (no throw).
- `lib/i18n/server.ts` — `translate(locale, key, params)` for server/print pages.

### ⚠️ CRITICAL build-breaking constraint

`lib/i18n/messages.ts`:
```ts
export type Messages = typeof en;                       // shape derived from en.json
const allMessages: Record<Locale, Messages> = { en, es, zh, ja, pt };
```
Because every locale is typed as `Messages` (= the exact shape of `en.json`), **every locale JSON must structurally match `en.json` exactly.** Add a key to `en.json` and the production `tsc` / `next build` FAILS until that same key path exists in `es`, `zh`, `ja`, and `pt-BR`. (A real build break was caused by exactly this.)

**When editing translations:** any key you add/remove/rename in `en.json` MUST be mirrored in all 5 files (`en`, `es`, `zh`, `ja`, `pt-BR`) with identical structure. `npm run dev` may tolerate drift; the build will not.

The tracker ships a `tracker.*` key tree (`columns`, `modal`, `manualAdd`, `bulk`, `errors`, `scroll`) plus `nav.applicationTracker`, present in all 5 locale files — subject to the same parity rule.

See [i18n.md](../../docs/agent/features/i18n.md), [i18n-preparation.md](../../docs/agent/features/i18n-preparation.md).

---

## Styling — Swiss International Style (MANDATORY)

All UI changes MUST follow the Swiss design system. Pack: [README](../../docs/portable/swiss-design-system/README.md) · [tokens](../../docs/portable/swiss-design-system/tokens.md) · [components](../../docs/portable/swiss-design-system/components.md) · [anti-patterns](../../docs/portable/swiss-design-system/anti-patterns.md) · [layouts](../../docs/portable/swiss-design-system/layouts.md). The rulebook is the pack plus the house conventions it now records; the rationale and decisions are in [the realignment spec](../../docs/superpowers/specs/2026-10-10-swiss-realignment-design.md).

Tailwind v4, configured **in CSS** (`app/(default)/css/globals.css`: hex values on `:root` as `--sw-*`, mapped in `@theme inline`) — there is no `tailwind.config`. PostCSS uses `@tailwindcss/postcss`. Light theme only. Use semantic tokens only; raw hex, `rgba()` and Tailwind palette scales (`blue-700`, `gray-500`) are banned outside `globals.css`.

| Token | Hex | Use |
|-------|-----|-----|
| `canvas` | `#F0F0E8` | Page background (`bg-canvas`) |
| `white` | `#FFFFFF` | Elevated surfaces: cards, inputs, dialogs |
| `ink` / `ink-soft` | `#000000` / `#3D424C` | Headings and borders / body text |
| `steel` | `#696D75` | Secondary text, placeholders. Never on `panel` |
| `paper`, `panel`, `panel-hover` | `#F5F5F0`, `#E5E5E0`, `#D8D8D2` | Sub-panel tint, secondary fills, hover fill |
| `primary` (+`-hover`) | `#1D4ED8` | Hyper Blue: links, primary actions, focus |
| `success` (+`-hover`) | `#127E3B` | Signal Green |
| `destructive` (+`-hover`) | `#D61E21` | Alert Red |
| `warning` (+`-hover`) | `#F97316` | Alert Orange fill. **Ink text only**; use `warning-text` (`#B44F02`) for orange labels and icons |
| `info-tint`, `success-tint`, `warning-tint`, `destructive-tint` | `#EFF6FF`, `#F0FDF4`, `#FFF7ED`, `#FEF2F2` | Alert fills |
| `highlight`, `overlay` | `#FFF085`, `rgb(0 0 0 / 0.5)` | Keyword `<mark>`; dialog backdrop |

Conventions:
- **Geometry:** `rounded-none` everywhere. **1px ink borders** (`border border-ink`) on controls, fields, cards and dialogs; 2px on alerts and emphasised cards.
- **Shadows are roles, hard and solid:** `shadow-sw-sm` controls · `shadow-sw-default` cards and menus · `shadow-sw-lg` dialogs and `PageFrame` · `shadow-sw-xl` home hero frame only · `shadow-sw-card` resume sheet only. No `shadow-md`, no `shadow-[…]`. Hover presses in (`hover:translate-x-px hover:translate-y-px hover:shadow-none`); nothing lifts.
- **Fonts, as rendered:** `font-sans` is Helvetica/Arial (body, `ink-soft`); `font-mono` is the label-face role and resolves to Space Grotesk, which is *not* a monospace; `font-serif` is Tailwind's default stack. No Geist. Type floor is `text-xs`; page H1 is `text-4xl md:text-5xl` serif bold uppercase; section headers are sentence case.
- **Spacing:** 4px scale: `1, 2, 3, 4, 6, 8, 12, 16`. No `5, 7, 9, 10, 11, 14`, no half-steps outside `components/ui/**`.
- **Selection is ink, blue is action:** a selected segment, tab or switch is `bg-ink text-white`.
- **Use the primitives** in `components/ui/**` and don't restyle them at call sites. A `<Link>` that looks like a button takes `buttonClass({ variant, size })`, never a `<Button>` inside a `<Link>`. Pages use `PageFrame` + `PageHeader` (builder and tracker use a compact single-row header on purpose); alerts are `Alert`; persistent status is `StatusIndicator` (`Loader2` only for work in flight); panels open with `PanelHeader`; empty lists use `EmptyState`. Dates go through `formatDate(value, locale)`.
- **Focus:** controls `focus-visible:ring-2 ring-primary ring-offset-2 ring-offset-canvas`; fields `focus-visible:border-primary ring-1 ring-primary`. Never a bare `focus:`.
- **Legacy names:** don't use the shadcn-era `bg-background`, `steel-grey`, `paper-tint`, `muted-foreground`, `secondary`, `muted`; the guard's `legacy-token` rule flags them (renames are in the pack's anti-patterns).

**Swiss guard.** Run `npm run guard -- <path>` on what you touched; it prints `file:line [rule]` with a fix hint. `tests/swiss-guard.test.ts` ratchets the counts in `tests/swiss-guard.allowlist.json`: it fails when a count rises (new drift) and when one falls without the allowlist being lowered. Lower the allowlist with `npm run guard:update`, which refuses increases. Fix drift; never raise the allowlist. `components/resume/**` and `app/print/**` are out of its scope.

**Motion.** `import { m } from 'motion/react'` only; `LazyMotion` runs in `strict` mode, so `motion.*` throws and the guard's `motion-import` rule flags it (never import `framer-motion` directly; see the alias gotcha below). `MotionProvider` lives in `app/(default)/layout.tsx` and never in `app/print/**`. Use `FadePresence` and `FadeItem` (`components/common/presence.tsx`) for alerts and list items; `Dialog` and `Dropdown` animate themselves. Take durations, the curve and the spring from `lib/motion.ts`. Motion is feedback only: press-in on hover, `transform`/`opacity` for presence, surfaces snap, no `transition-all`, no `layout`. Read reduced motion with `useReducedMotion()`, never raw `matchMedia`. The home hero entrance is plain CSS (`.hero-enter`).

Resume render templates have their own CSS modules in `components/resume/styles/` (`_tokens.css`, `swiss-single`, `swiss-two-column`, `modern`, `modern-two-column`). Template types/settings: `lib/types/template-settings.ts`. See [resume-templates.md](../../docs/agent/features/resume-templates.md), [template-system.md](../../docs/agent/design/template-system.md), [pdf-template-guide.md](../../docs/agent/design/pdf-template-guide.md), [adding-resume-templates.md](../../docs/agent/features/adding-resume-templates.md).

---

## Essential Commands

```bash
# from apps/frontend
npm install
npm run dev       # next dev --turbopack (:3000)
npm run build     # next build  (runs tsc — i18n shape drift fails HERE)
npm run start
npm run lint      # oxlint + prettier --check (JS/TS files)
npm run typecheck # tsc --noEmit
npm run format    # prettier --write .
npm run test      # vitest run (includes the Swiss guard and contrast tests)
npm run guard     # Swiss drift report; `npm run guard -- <path>` to filter
npm run guard:update  # lower the guard allowlist (refuses increases)
npm run report:first-load  # first-load JS per route, after a build
```

Backend must run separately on :8000 (see root CLAUDE.md). Frontend proxies `/api/*`, `/docs`, `/redoc`, `/openapi.json` to `BACKEND_ORIGIN` via `next.config.ts` rewrites. **Do not create `app/api/` routes** — filesystem routes shadow the proxy.

---

## Non-Negotiable Frontend Rules

1. All UI MUST follow Swiss International Style (links above). `rounded-none`, 1px ink borders, hard shadows by role, semantic tokens, shared primitives, and a clean `npm run guard -- <path>` on what you touched.
2. Run `npm run lint` and `npm run format` before committing frontend changes.
3. Any `en.json` key change MUST be mirrored across all 5 locale files (see i18n) or the build breaks.
4. **Textarea Enter-key pattern** — confirmed in code (e.g. `app/(default)/tailor/page.tsx`): when a textarea sits inside a dialog/form that submits on Enter, stop propagation:
   ```tsx
   const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
     if (e.key === 'Enter') e.stopPropagation();
   };
   ```
5. All backend access via `lib/api/*` (never raw `fetch` to the backend in components).
6. Sanitize user/LLM HTML with `sanitizeHtml` (`lib/utils/html-sanitizer.ts`, DOMPurify, whitelist `strong/em/u/a`) before `dangerouslySetInnerHTML`.
7. Next.js perf patterns are required reading: [nextjs-performance pack](../../docs/portable/nextjs-performance/README.md) + [checklist](../../docs/portable/nextjs-performance/checklist.md).

---

## Key Gotchas

- **Lucide imports:** hot-path/page code imports icons from the deep path (`lucide-react/dist/esm/icons/x`) to avoid the barrel; `optimizePackageImports` in `next.config.ts` also tree-shakes lucide/tiptap/dnd-kit. Stay consistent.
- **240s timeout** on AI calls (`apiFetch` default) — matches backend; don't shorten for improve/regenerate flows.
- **`print/*` pages are server components** that read template settings from `searchParams` and call the backend via internal origin — keep them server-side.
- Two i18n locations exist: `i18n/` (config) and `lib/i18n/` (engine). Don't confuse them.
- **`motion/react` is aliased to `framer-motion` for Turbopack** (`turbopack.resolveAlias` in `next.config.ts`). Without it `import { m } from 'motion/react'` pulls in most of framer-motion and defeats `LazyMotion`'s lazy chunk (about +43 KB gzip per product route). Keep the alias, and keep `framer-motion` and `motion` pinned together. Details and the budget (250 KB per route, currently exceeded; the bundle pass is a separate sub-project) are in [first-load-js.md](../../docs/agent/architecture/first-load-js.md).
- **Linting is Oxlint** (`.oxlintrc.json`, migrated from the old `eslint-config-next` setup: Next.js core-web-vitals, React/React Compiler hooks rules, jsx-a11y subset, TypeScript recommended). Only listed rules run (`correctness` category off). `react/set-state-in-effect` stays off (existing effects sync props/DOM measurements). Formatting is enforced by the `prettier --check` half of `npm run lint`. Oxlint honours `eslint-disable` comments; new ones use `oxlint-disable-next-line <rule> -- <reason>` (three intentional `new Date()` render reads carry `react/purity` disables).

---

## Testing

`vitest` (jsdom) + Testing Library. Config `vitest.config.ts`, setup `vitest.setup.ts` (auto-cleanup, and a global mock of `motion/react` that renders `m.*` as plain DOM and presence as a passthrough, so tests see the final state immediately). Run `npm run test` (or `./node_modules/.bin/vitest run`). **Tests are in scope** (see [testing-strategy.md](../../docs/agent/testing-strategy.md)); keep them deterministic and anti-theater (a test must fail when its target breaks).

Specs (`tests/`):
- **i18n** — `i18n-utils.test.ts` (`getNestedValue` dot-path + `applyParams` substitution), `i18n-locale-parity.test.ts` (every `messages/*.json` must structurally match `en.json` — the in-suite guard for the build break).
- **lib/utils** — `keyword-matcher.test.ts`, `section-helpers.test.ts`, `html-sanitizer.test.ts` (XSS whitelist), `download-utils.test.ts`.
- **lib/api** — `api-client.test.ts` (URL resolution, timeout/AbortError; `fetch` stubbed).
- **components** — `diff-preview-modal.test.tsx`, `regenerate-wizard.test.tsx`, plus behaviour specs for the shared primitives: `dialog`, `dropdown`, `segmented-control`, `toggle-tabs`, `button`, `card`, `alert-status`, `panel-empty`, `page-frame`, `presence`, `reduced-motion`.
- **Swiss design** — `swiss-guard.test.ts` (the count ratchet over `tests/swiss-guard.allowlist.json`), `swiss-guard-rules.test.ts` (every rule flags what it should and allows what it should), `swiss-contrast.test.ts` (parses the `--sw-*` hex from `globals.css` and asserts WCAG 2.2 AA for every text and text-on-fill pairing, 3:1 for meaningful graphics, and that `THEME_COLOR` equals Canvas). Changing a token so a pairing falls below its threshold fails the test.

Pure logic (i18n, utils, api) is tested directly with stubbed `fetch`/`t`; component specs render via Testing Library. The locale-parity spec mirrors `scripts/check_locale_parity.py` (which the pre-push hook also runs without Node). The local `pre-push` gate runs this vitest suite too when Node is available — `git config core.hooksPath .githooks`; see [`.githooks/README.md`](../../.githooks/README.md).

---

## Documentation by Task

| Task | Docs |
|------|------|
| Frontend architecture / user flow | [frontend-architecture.md](../../docs/agent/architecture/frontend-architecture.md), [frontend-workflow.md](../../docs/agent/architecture/frontend-workflow.md) |
| Coding conventions | [coding-standards.md](../../docs/agent/coding-standards.md) |
| API contracts | [front-end-apis.md](../../docs/agent/apis/front-end-apis.md), [api-flow-maps.md](../../docs/agent/apis/api-flow-maps.md) |
| Scope / principles / process | [scope-and-principles.md](../../docs/agent/scope-and-principles.md), [workflow.md](../../docs/agent/workflow.md) |
| Swiss design system (MANDATORY) | [pack README](../../docs/portable/swiss-design-system/README.md), [tokens](../../docs/portable/swiss-design-system/tokens.md), [components](../../docs/portable/swiss-design-system/components.md), [anti-patterns](../../docs/portable/swiss-design-system/anti-patterns.md), [layouts](../../docs/portable/swiss-design-system/layouts.md) |
| Swiss realignment (decisions, tokens, phases) | [swiss-realignment-design.md](../../docs/superpowers/specs/2026-10-10-swiss-realignment-design.md) |
| First-load JS budget and the Motion alias | [first-load-js.md](../../docs/agent/architecture/first-load-js.md) |
| Next.js performance (REQUIRED) | [pack README](../../docs/portable/nextjs-performance/README.md), [checklist](../../docs/portable/nextjs-performance/checklist.md) |
| i18n | [i18n.md](../../docs/agent/features/i18n.md), [i18n-preparation.md](../../docs/agent/features/i18n-preparation.md) |
| Resume templates / PDF | [resume-templates.md](../../docs/agent/features/resume-templates.md), [template-system.md](../../docs/agent/design/template-system.md), [pdf-template-guide.md](../../docs/agent/design/pdf-template-guide.md), [adding-resume-templates.md](../../docs/agent/features/adding-resume-templates.md) |
| Custom sections | [custom-sections.md](../../docs/agent/features/custom-sections.md) |
| AI enrichment | [enrichment.md](../../docs/agent/features/enrichment.md) |
| JD matching | [jd-match.md](../../docs/agent/features/jd-match.md) |

---

## Out of Scope (do not modify without explicit request)

- `.github/workflows/`, CI/CD, Docker behavior
- Existing tests (no removal/disabling)
- `next.config.ts` rewrites / proxy behavior unless the task is about it
