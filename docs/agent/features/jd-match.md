# JD Match Feature

> **Shows how well a tailored resume matches the original job description.**

## Overview

The Resume Builder includes a "JD Match" tab that shows how well a tailored resume matches the original job description.

## How It Works

1. User tailors a resume against a job description
2. Opens the tailored resume in the Builder
3. "JD MATCH" tab appears (only for tailored resumes)
4. Shows side-by-side comparison:
   - **Left panel**: Original job description (read-only)
   - **Right panel**: Resume with matching keywords highlighted in yellow

## Features

- **Keyword extraction**: Extracts significant keywords from JD (filters common stop words)
- **Case-insensitive matching**: Matches keywords regardless of case
- **Match statistics**: Shows total keywords, matches found, and match percentage
- **Color-coded percentage**: Green (≥50%), yellow (≥30%), red (<30%)

## Key Files

| File | Purpose |
|------|---------|
| `apps/frontend/lib/utils/keyword-matcher.ts` | Keyword extraction and matching utilities |
| `apps/frontend/components/builder/jd-comparison-view.tsx` | Main split-view component |
| `apps/frontend/components/builder/jd-display.tsx` | Read-only JD display |
| `apps/frontend/components/builder/highlighted-resume-view.tsx` | Resume with keyword highlighting |
| `apps/backend/app/routers/resumes.py` | `GET /{resume_id}/job-description` endpoint |

## API Endpoint

| Endpoint | Description |
|----------|-------------|
| `GET /resumes/{resume_id}/job-description` | Fetch JD used to tailor a resume |
