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

| File | Purpose |
|------|---------|
| `apps/backend/app/prompts/enrichment.py` | AI prompts for analysis and enhancement |
| `apps/backend/app/routers/enrichment.py` | API endpoints for enrichment workflow |
| `apps/frontend/hooks/use-enrichment-wizard.ts` | React state management for wizard flow |
| `apps/frontend/components/enrichment/*.tsx` | UI components for enrichment modal |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /enrichment/analyze/{resume_id}` | Analyze resume and generate questions |
| `POST /enrichment/enhance` | Generate enhanced descriptions from answers |
| `POST /enrichment/apply/{resume_id}` | Apply enhancements to resume |
