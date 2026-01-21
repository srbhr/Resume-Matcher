# Frontend Architecture

> Next.js 15 + React 19 | TypeScript | Tailwind | Swiss International Style

## Directory Structure

```
apps/frontend/
├── app/
│   ├── (default)/           # Main app routes
│   │   ├── page.tsx         # Landing (/)
│   │   ├── dashboard/       # /dashboard
│   │   ├── builder/         # /builder
│   │   ├── tailor/          # /tailor
│   │   ├── settings/        # /settings
│   │   └── resumes/[id]/    # /resumes/[id]
│   └── print/               # Print routes for PDF
├── components/
│   ├── ui/                  # Button, Input, Dialog, etc.
│   ├── builder/             # ResumeBuilder, forms/
│   ├── preview/             # PaginatedPreview, usePagination
│   └── resume/              # Templates (single, two-column)
├── lib/
│   ├── api/                 # client.ts, resume.ts, config.ts
│   ├── context/             # status-cache.tsx, language-context.tsx
│   └── constants/           # page-dimensions.ts
└── messages/                # i18n translations
```

## Pages

### Dashboard (`/dashboard`)
- Master resume card + tailored resume tiles
- States: `loading | pending | processing | ready | failed`
- Auto-refreshes on window focus
- localStorage: `master_resume_id`

### Builder (`/builder`)
- Left: Editor Panel (forms + formatting controls)
- Right: WYSIWYG PaginatedPreview
- Tabs: Resume | Cover Letter | Outreach
- Auto-saves to localStorage

### Tailor (`/tailor`)
- Job description textarea
- Calls: `POST /jobs/upload` → `POST /resumes/improve`
- Redirects to `/resumes/[new_id]`

### Settings (`/settings`)
- Provider selection (6 providers)
- API key input
- System status (cached, 30-min refresh)

### Print Routes (`/print/resumes/[id]`, `/print/cover-letter/[id]`)
- Headless Chrome renders these for PDF
- Query params: template, pageSize, margins, spacing

## UI Components

**Button variants:** default (blue), destructive (red), success (green), warning (orange), outline, secondary

**Styling:** `rounded-none`, hard shadows, `font-mono` for labels

## Context Providers

### StatusCacheProvider
```typescript
const { status, refreshStatus, incrementResumes, decrementResumes } = useStatusCache();
```
- Caches system status, 30-min auto-refresh
- Optimistic counter updates on user actions

### LanguageProvider
```typescript
const { contentLanguage, setContentLanguage } = useLanguage();
```
- Content generation language (en, es, zh, ja)

## API Client (`lib/api/`)

```typescript
import { fetchResume, API_BASE } from '@/lib/api';

// client.ts exports
API_URL, API_BASE, apiFetch, apiPost, apiPatch, apiDelete

// resume.ts
uploadJobDescriptions, improveResume, fetchResume, fetchResumeList
updateResume, downloadResumePdf, deleteResume

// config.ts
fetchLlmConfig, updateLlmConfig, testLlmConnection, fetchSystemStatus
```

## localStorage Keys

| Key | Purpose |
|-----|---------|
| `master_resume_id` | Master resume UUID |
| `resume_builder_draft` | Auto-saved form data |
| `resume_builder_settings` | Template preferences |

## Pagination System

`usePagination` hook calculates page breaks:
- Respects `.resume-item` boundaries
- Prevents orphaned headers
- 150ms debounce for performance

## Critical CSS Rule

For PDF generation, `globals.css` must whitelist print classes:
```css
@media print {
  body * { visibility: hidden !important; }
  .resume-print, .resume-print * { visibility: visible !important; }
  .cover-letter-print, .cover-letter-print * { visibility: visible !important; }
}
```
