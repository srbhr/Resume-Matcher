# Settings error-container overflow fix

**Date:** 2026-04-17
**Issue:** #754
**Branch:** `dev` (bundle into PR with #751 and #749)

## Problem

When the LLM health check returns a 404 with a long response body (error detail, stack trace, URL with query string), the `<pre>` element inside the health-check detail block and the `<p>` inside the top-level error banner overflow their containers horizontally. The page layout breaks and the Settings panel becomes unreadable on narrow viewports.

The bug pattern: `font-mono` + default `overflow-wrap: normal` keeps unbreakable strings on a single line and blows out the parent's width. The same pattern exists in multiple error containers on the Settings page.

## Goals

- Long error strings wrap inside their containers across all Settings error surfaces.
- No horizontal scroll on the Settings page regardless of error content.
- Design stays Swiss: hard borders, monospace text, no visual softening.

## Non-goals

- Redesigning the error-card visual treatment.
- Changing the error message content or codes.
- Refactoring unrelated Settings components.

## Design

### Where the bug appears

Five locations in `apps/frontend/app/(default)/settings/page.tsx` use the same pattern and share the bug:

1. **Top-level save/load error banner** (around line 882): `<div className="border border-red-300 bg-red-50 p-3"><p className="text-xs text-red-600 font-mono">...`
2. **Health-check result card** (around line 891): container with `healthy ? green : red` styling; renders error message, warning message, and detail items.
3. **Health-check inline error message** (around line 919): `<p className="font-mono text-xs text-red-600 mt-1">`
4. **Health-check inline warning message** (around line 923): same pattern
5. **Health-check detail items' `<pre>` blocks** (around lines 929-945): each detail item renders its value inside `<pre className="mt-1 whitespace-pre-wrap rounded-none border border-black bg-white p-3 text-xs text-ink-soft shadow-sw-sm">`. `whitespace-pre-wrap` handles newlines but does NOT break unbreakable tokens.

### Fix

Two Tailwind utilities are enough:

- `break-words` — equivalent to `overflow-wrap: break-word`. Breaks at word boundaries where possible, falls back to mid-word breaks for unbreakable tokens.
- `min-w-0` on any flex parent that contains wrapping text. Flex items default to `min-width: auto`, which prevents shrinking below content size; `min-w-0` re-enables shrinking so the text can wrap.

Apply across the five locations:

| Location | Class additions |
|---|---|
| Top-level error banner `<div>` | `break-words` on the `<p>` inside |
| Health-check result card outer `<div>` | `break-words` |
| Health-check inline error `<p>` | `break-words` |
| Health-check inline warning `<p>` | `break-words` |
| Health-check detail `<pre>` blocks | `break-words` (complements existing `whitespace-pre-wrap`) |

The existing `whitespace-pre-wrap` on `<pre>` preserves newlines. Adding `break-words` adds mid-token breaking for long unbroken strings (URLs, base64 blobs).

### Data flow

No change. Pure CSS.

## Files touched

| File | Change |
|---|---|
| `apps/frontend/app/(default)/settings/page.tsx` | Add `break-words` to 5 containers/elements |

Estimated ~5-8 line-touches.

## Risks

- `break-words` can produce ugly mid-word breaks on narrow viewports. Acceptable for error surfaces — legibility of the layout outweighs prettiness of a single word.
- `min-w-0` is NOT needed for these specific layouts because they're in a `<section>` with `space-y-*`, not flex children — verified against current markup.

## Rollback

Pure style change. Revert restores the current (buggy) behavior. No data migration.

## Verification

Manual, on a narrow viewport (~360px):
1. Configure invalid API base URL (e.g., `https://example.com/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/v1`).
2. Click Test Connection.
3. Error text, error detail, and all rendered strings stay within the container. No horizontal scroll on the page.
4. Swiss styling preserved: hard borders, monospace text, no rounded corners.
