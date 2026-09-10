# Resume Enrichment Feature

> **AI-powered resume improvement with targeted questions.**

## Overview

The enrichment feature helps users improve their master resume with more detailed content by:

1. Analyzing the resume for weak/generic descriptions
2. Asking targeted questions about their experience
3. Generating additional bullet points based on answers

## How It Works

1. User clicks "Enhance Resume" on the master resume page
2. AI analyzes the resume and identifies weak/generic descriptions
3. User answers targeted questions (max 6 questions total) about their experience
4. AI generates additional bullet points based on user answers
5. New bullets are **added** to existing content (not replaced)

## Key Design Decisions

- **Maximum 6 questions**: To avoid overwhelming users, the AI generates at most 6 questions across all items
- **Additive enhancement**: Original bullet points are preserved; new enhanced bullets are appended after them
- **Question prioritization**: AI prioritizes the most impactful questions that will yield the best improvements

## Key Files

| File                                           | Purpose                                 |
| ---------------------------------------------- | --------------------------------------- |
| `apps/backend/app/prompts/enrichment.py`       | AI prompts for analysis and enhancement |
| `apps/backend/app/routers/enrichment.py`       | API endpoints for enrichment workflow   |
| `apps/frontend/hooks/use-enrichment-wizard.ts` | React state management for wizard flow  |
| `apps/frontend/components/enrichment/*.tsx`    | UI components for enrichment modal      |

## API Endpoints

| Endpoint                               | Description                                 |
| -------------------------------------- | ------------------------------------------- |
| `POST /enrichment/analyze/{resume_id}` | Analyze resume and generate questions       |
| `POST /enrichment/enhance`             | Generate enhanced descriptions from answers |
| `POST /enrichment/apply/{resume_id}`   | Apply enhancements to resume                |

## Failure and retry boundaries

Enhancement generation returns `enhancements` and per-item `errors`; an entirely failed attempt returns an error instead of an empty success. The preview names failed items and allows applying the successful items. Failed items retain their original content. Analysis and replacement services validate AI result structure before returning it.

A final-prompt size rejection while generating one item is an item error: successful items before or after it remain applicable, and the failed item asks the user to shorten its description or answers. If no item succeeds and a prompt is oversized, the request remains HTTP 422. Request/source bounds and the shared legacy analysis stage also remain request-wide errors. The total POST deadline is different: it cancels the operation and returns HTTP 504 even after earlier items completed. That expired operation does not return an actionable partial preview.

The wizard hook owns one resume and one active attempt. Reset, unmount and resume changes invalidate old results. Apply failure returns to the same preview with its failed-item notice. After apply succeeds, the viewer owns a separate refresh: a failure keeps the saved acknowledgement visible and Retry fetches the resume without applying it again. Closing the modal or changing resume identity invalidates late refresh results. These contracts are tested through the actual hooks, viewer/modal and preview components in `apps/frontend/tests/wizard-hook-lifecycle.test.tsx`, `apps/frontend/tests/resume-viewer-enrichment-lifecycle.test.tsx` and `apps/frontend/tests/enrichment-preview-errors.test.tsx`.

See [AI operation budgets](../architecture/ai-operation-budgets.md) for collection limits, bounded regeneration concurrency and the shared POST deadline.
