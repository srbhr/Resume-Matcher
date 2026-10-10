# Effects and icons (sub-project 4) — design

**Date:** 2026-10-10 · **Status:** draft, awaiting owner approval · **Builds on:** the Swiss realignment (`2026-10-10-swiss-realignment-design.md`), on `dev` at `420c97b`.

## Why

The blueprint grid now sits behind every framed page and the home hero. It reads as plain and overused. The owner wants a quieter, living background, and an effect that makes AI generation *feel* like computation. The app also still uses Lucide icons, which were parked for a family that suits the Swiss brutalist style better. And it needs real brand marks for LinkedIn, GitHub and the AI providers.

## Owner decisions (2026-10-10)

| # | Decision |
|---|---|
| E1 | The page background becomes **grey Pixel Beams**: diagonal beams of square dots in translucent grey ink on Canvas. This replaces `bg-blueprint` everywhere it is used: `PageFrame` and the home hero. |
| E2 | **Retro Bitrate** is the AI-generation effect: bit-crushed blocks that churn while a resume is generating. It also forms the background of the Tailor view (subdued at rest, active while generating). |
| E3 | Effects are **ported presets in small in-house code**. The Shaders MCP supplies each preset's shader and parameters. We ship a few-KB component (canvas or one tiny WebGL fragment shader), lazy-loaded. **No `shaders/js` runtime** (about 705 KB gzipped; the website rejected it for the same reason). |
| E4 | The icon family is **Phosphor** (`@phosphor-icons/react`). |
| E5 | **Settings → "Background effects" on/off.** Off removes every effect canvas (for people who dislike it or have viewing problems). |
| E6 | **Brand marks are owner-supplied SVGs.** The owner downloads them; we turn them into single-colour React components. |

## 1. Effects

### Components (`components/effects/`, client-only)
- **`DitherField`**: a React port of the website's `DitherField` `pattern="beams"` (`Resume-Matcher-Website/src/components/fundations/elements/DitherField.astro`, already in our palette). Square dots on a cell grid, switched on by an 8×8 Bayer matrix, with diagonal beams and streaks moving toward the top right.
  - Dot colour is `currentColor`; the call site sets it, e.g. `text-ink/15` on Canvas.
  - Runs at 12 fps and draws all dots as one path per frame.
- **`RetroBitrate`**: the shaders.com Retro Bitrate look in ink and Hyper Blue at low alpha.
  - Two intensities: `idle` (very slow, sparse) and `active` (churning).
  - Parameters come from the Shaders MCP preset. If its maths needs a GPU, use one fragment shader on a raw WebGL context (no library), with the canvas fallback below.

### Shared rules (both components)
- `aria-hidden`, `pointer-events-none`, absolutely positioned behind content. Text never sits on an un-scrimmed effect.
- Runs only while visible (IntersectionObserver) and while the tab is visible (`visibilitychange`). DPR-aware; resizes with a ResizeObserver.
- `useReducedMotion()` true → one still frame, no loop.
- Loaded with `next/dynamic` (`ssr: false`), so effects never enter first-load JS. Target: ≤ 3 KB gz added per route (measure with `npm run report:first-load`; record the result in `docs/agent/architecture/first-load-js.md`).
- First paint is plain Canvas (`bg-canvas`); the canvas fades in over 200 ms (`lib/motion.ts`).
- Never in `app/print/**`, the resume/cover-letter sheets, or dialogs.

### Placement
- **PageFrame** (dashboard, settings, tailor, wizard, viewer…) and the **home hero**: `DitherField` replaces `bg-blueprint`.
- **Tailor** (`app/(default)/tailor`): `RetroBitrate` replaces the beams behind the narrow card.
  - `idle` while the page waits for input; `active` while `isLoading` (generate/preview), back to `idle` when the diff modal opens or on error.
  - The existing spinner and elapsed-seconds text stay; the effect adds atmosphere and doesn't replace status.
- **Resume wizard** generation wait (finalize/create): `RetroBitrate` `active` behind the busy state.
- `bg-blueprint` is deleted once nothing uses it. The guard's allowlist and the docs follow.

### Settings toggle (E5)
- `lib/context/effects-context.tsx`: an `EffectsProvider` + `useEffectsEnabled()`, mounted in `app/(default)/layout.tsx` next to `MotionProvider`.
  - The value persists in `localStorage` (`resume_matcher_effects`; read in try/catch; default **on**). It is client-only, like the UI language.
- Settings gets a "Display" section, or the existing language section gains a row, with a `ToggleSwitch`: **Background effects**, described as "Animated backgrounds behind pages and while AI is working. Turn off for a plain background."
  - Strings are added in all 7 locales.
- Off → effect components render `null`, leaving plain Canvas. Reduced motion is independent: when effects are on, it still freezes them to one frame.

## 2. Icons (Phosphor)

- Add `@phosphor-icons/react` (exact pin) and list it in `optimizePackageImports`. Server components import from `@phosphor-icons/react/dist/ssr`.
- Sweep every `lucide-react` import in `app/**`, `components/**` (except `components/resume/**`, the printed templates, which stay out of scope), `hooks/**` and `lib/**`. That is today about 53 files and about 50 distinct icons.
  - Write a mapping table (Lucide → Phosphor), e.g. `Loader2→SpinnerGap`, `X→X`, `ChevronDown→CaretDown`, `Github→GithubLogo`, `Linkedin→LinkedinLogo`.
  - Default weight is `regular`; `bold` at 12–14 px where regular reads too thin. Sizes stay where they are (16 px floor).
- Add a guard rule, `lucide-import`, that flags `lucide-react` outside `components/resume/**`. It joins the two-way ratchet at 0 after the sweep.
- Remove `lib/types/lucide.d.ts` and the deep-path import gotcha from the docs if nothing needs them any more. Drop `lucide-react` only if the printed templates don't use it (they do today, so it stays).

## 3. Brand marks (E6)

- Owner drops SVGs into `apps/frontend/assets/brands/` (not served). An agent converts each into `components/ui/brand-icon.tsx`:
  - `<BrandIcon name="openai" />`, single path or paths, `fill="currentColor"`, viewBox kept, and an `aria-label` from the brand name (or `aria-hidden` beside a visible name).
- Uses:
  - The Settings AI-provider picker shows each provider's mark beside its name (ink; white when the segment is selected).
  - The outreach preview shows the LinkedIn mark.
  - The projects form shows GitHub. Phosphor's own logo glyphs are acceptable until the owner's files land.
- Marks are monochrome in the UI, following the Swiss rule of ink, not brand colours.

## Testing

- Effects: a unit test for the Bayer/beam frame function (a deterministic frame for a fixed time). Component tests check that:
  - effects-off renders nothing;
  - reduced motion draws once (requestAnimationFrame is not re-scheduled);
  - a hidden tab stops the loop.
  
  The `motion/react` mock already covers `useReducedMotion`.
- Toggle: the Settings row flips `useEffectsEnabled()`, persists to localStorage, and survives a throwing `localStorage`.
- Icons: the guard rule has samples in `swiss-guard-rules.test.ts`; existing component tests keep passing with the new SVGs (update queries that relied on Lucide class names).
- Brand icons: each name renders an SVG with `fill="currentColor"`; an unknown name renders nothing.

## Phases and parallelism (Sonnet implementers; Opus not needed)

| Phase | Work | Needs |
|---|---|---|
| A1 | `DitherField` + `EffectsProvider` + Settings toggle + PageFrame/hero swap | the website file (available) |
| A2 | Phosphor sweep + guard rule | nothing |
| B | `RetroBitrate` + Tailor and wizard integration | **Shaders MCP connected in this repo**, for the preset |
| C | `BrandIcon` + provider picker, outreach and projects uses | **owner's SVG files** |

A1 and A2 run in parallel, in separate worktrees; their only shared file, `settings/page.tsx`, gets different hunks. B and C start when their inputs exist.

## Out of scope

The printed resume templates (`components/resume/**`, `app/print/**`); dark mode; brand colours in the UI; the Next.js performance pass (sub-project 2); the Trello-style tracker modal (sub-project 3).
