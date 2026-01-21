# Frontend Workflow

> User flows and state management for Resume Matcher.

## Core User Flow

```
Dashboard → Upload Master Resume → Tailor for Job → View/Edit → Download PDF
```

## Pages

### 1. Dashboard (`/dashboard`)
- **No master:** "Initialize Master Resume" card
- **Has master:** "Master Resume" card + tailored tiles
- **Create:** "+" card opens `/tailor`
- Auto-refreshes on window focus

### 2. Resume Viewer (`/resumes/[id]`)
- Read-only display at 250mm width
- Actions: Back, Edit, Download PDF, Delete
- Delete shows confirmation + success dialogs

### 3. Tailor (`/tailor`)
- Job description textarea (min 50 chars)
- Process: Upload JD → Improve → Redirect to viewer

### 4. Builder (`/builder`)
- **Left panel:** Editor (forms + formatting)
- **Right panel:** WYSIWYG preview
- **Tabs:** Resume | Cover Letter | Outreach
- Data priority: URL param → Context → localStorage → defaults

### 5. Settings (`/settings`)
- System status (cached)
- LLM configuration (6 providers)
- Last fetched indicator + manual refresh

## Pagination Rules

- Sections CAN span pages
- Individual items stay together
- Pages ≥50% full before break
- Headers never orphaned

## State Management

### localStorage
| Key | Purpose |
|-----|---------|
| `master_resume_id` | Master resume UUID |
| `resume_builder_draft` | Auto-saved form |
| `resume_builder_settings` | Template prefs |

### StatusCache Context
- Initial fetch on app start
- 30-min auto-refresh
- Optimistic counter updates

## Delete Flow

1. Click Delete → Confirmation dialog
2. API: `DELETE /resumes/{id}`
3. Clear localStorage if master
4. Success dialog → Redirect to dashboard

## Section Management

| Action | Result |
|--------|--------|
| Rename | Click pencil icon |
| Reorder | Up/down arrows |
| Hide | Eye icon (hidden sections still editable) |
| Delete | Hides default, removes custom |
| Add | "Add Section" button |

## API Client

```typescript
import { fetchResume, API_BASE } from '@/lib/api';

// Resume operations
fetchResume, fetchResumeList, updateResume, deleteResume
uploadJobDescriptions, improveResume, downloadResumePdf

// Config operations  
fetchLlmConfig, updateLlmConfig, testLlmConnection
```
