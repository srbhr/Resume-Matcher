# Issue Close Tracker

> Status snapshot: **2026-06-02**. Nothing is closed yet (deliberate). All fixes below are merged to **`dev`**; the linked issues close on the next **`dev → main`** release. This is a transient release checklist — delete it once `main` ships and the issues are closed.

## ✅ Fixed on `dev` — close on next `dev → main` release

Each fix was root-caused from code, tested, and (for app-behavior changes) verified against the e2e-monitor before merge.

| Issue | Title | Fix PR (→ `dev`) | Verification |
|-------|-------|------------------|--------------|
| #805 | AI Tailor lowercases / rewrites only some sections | #827 | e2e + evals |
| #799 | PDF rendering timeout (503) | #828 | pytest + e2e (renders non-blank) |
| #808 | Failed to download resume (503) | #828 | same root cause as #799 |
| #811 | Error message overflows the download modal | #828 | backend generic error + modal containment |
| #760 | Base URL / API endpoint in Settings gets stuck | #829 | pytest (null/blank/omit cases) |
| #736 | Skill not parsing or changing | #830 | pytest + e2e (salvage fires, originals kept) |
| #763 | Enter key doesn't create newlines in Additional Info | #834 | vitest 131 passed |
| #776 | 240s timeout too short for local LLMs | #833 | pytest (settings + wiring) + frontend vitest |

## ✅ Resolved (no PR needed) — close after release / safe to close now

| Issue | Title | Status |
|-------|-------|--------|
| #806 | Frontend build is breaking | Cause (missing `tailor.errors.timeout` locale key) is gone; locale parity = 643 keys × 5 locales, and `npm run build` passes clean on `dev`. **Ready to close.** |

## 🔒 Security

| Alert | Title | Status |
|-------|-------|--------|
| Dependabot #224 | `vitest < 4.1.0` — CVE-2026-47429 (UI server arbitrary file read/exec) | Patched: `vitest 4.0.18 → 4.1.8` (#835, on `dev`). Dev-only dep, vulnerable feature (`@vitest/ui`) not installed/used → ~nil real exposure. Alert auto-resolves once the patched lockfile reaches the **default branch** (`main`). Do **not** dismiss — the bump is the fix. |

## ⏸️ Deferred — will NOT close yet

| Issue | Title | Why deferred |
|-------|-------|--------------|
| #777 | Garbled PDF output for Chinese resumes (Docker) | Root cause = missing CJK fonts in the Docker image; fix requires editing Docker build behavior, which is out of scope without explicit sign-off. Revisit when Docker work is approved. |

## 📝 Still open — not part of this bug sweep (no close planned)

These remain open for triage / contributors; listed only so they aren't mistaken for "pending close":

- #731 — Feature: AWS Bedrock provider support
- #737 — Feature: API endpoint for the AI agent
- #740 — Feature: (under-specified — needs clarification or close)
- #772 — Feature: Chrome extension (has external PR #821; not being pursued)
- #810 — Feature: Resume scoring + ATS simulation (has external PR #813)
- #732 — Internal review-tracking issue (maintainer)

## How these actually close

The per-PR `Fixes #NNN` keywords targeted **`dev`**, not the default branch, so they did **not** auto-close. To close them on release, put an explicit list in the **`dev → main`** PR body:

```
Closes #805, #799, #808, #811, #760, #736, #763, #776
```

(`#806` can be added there too, or closed manually as already-resolved.)
