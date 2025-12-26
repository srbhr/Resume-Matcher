# Frontend Architecture Documentation

> **Last Updated:** December 27, 2024
> **Framework:** Next.js 15 with App Router, React 19, TypeScript, Tailwind CSS
> **Design System:** Swiss International Style (Brutalist)

---

## 1. Directory Structure

```
apps/frontend/
├── app/
│   ├── layout.tsx                  # Root layout (fonts, metadata)
│   ├── globals.css                 # Global styles (imported via layout)
│   ├── (default)/                  # Route group for main app
│   │   ├── layout.tsx              # App layout (StatusCacheProvider, ResumePreviewProvider)
│   │   ├── page.tsx                # Landing page (/)
│   │   ├── dashboard/page.tsx      # Dashboard (/dashboard)
│   │   ├── builder/page.tsx        # Resume editor (/builder)
│   │   ├── tailor/page.tsx         # AI tailoring (/tailor)
│   │   ├── settings/page.tsx       # Settings (/settings)
│   │   └── resumes/[id]/page.tsx   # Resume viewer (/resumes/[id])
│   └── print/                      # Print-specific routes (no layout)
│       ├── resumes/[id]/page.tsx   # Print-ready resume (/print/resumes/[id])
│       └── cover-letter/[id]/page.tsx # Print-ready cover letter (/print/cover-letter/[id])
├── components/
│   ├── ui/                         # Base UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── label.tsx
│   │   ├── dialog.tsx
│   │   ├── confirm-dialog.tsx
│   │   ├── retro-tabs.tsx          # Windows 98 style tabs component
│   │   └── toggle-switch.tsx       # Swiss brutalist toggle switch
│   ├── home/                       # Landing page components
│   │   ├── hero.tsx
│   │   └── swiss-grid.tsx
│   ├── dashboard/                  # Dashboard components
│   │   ├── resume-component.tsx    # Main Resume renderer
│   │   ├── resume-card.tsx
│   │   └── resume-upload-dialog.tsx
│   ├── builder/                    # Builder components
│   │   ├── resume-builder.tsx      # Main builder container (with tabs)
│   │   ├── resume-form.tsx         # Form container
│   │   ├── formatting-controls.tsx
│   │   ├── template-selector.tsx
│   │   ├── cover-letter-editor.tsx # Cover letter textarea editor
│   │   ├── cover-letter-preview.tsx # Cover letter preview component
│   │   ├── outreach-editor.tsx     # Outreach message editor with copy
│   │   ├── outreach-preview.tsx    # Outreach message preview
│   │   └── forms/                  # Section-specific forms
│   │       ├── personal-info-form.tsx
│   │       ├── summary-form.tsx
│   │       ├── experience-form.tsx
│   │       ├── education-form.tsx
│   │       ├── projects-form.tsx
│   │       └── additional-form.tsx
│   ├── resume/                     # Resume templates
│   │   ├── index.ts                # Template exports
│   │   ├── resume-single-column.tsx
│   │   └── resume-two-column.tsx
│   ├── preview/                    # WYSIWYG preview
│   │   ├── index.ts
│   │   ├── paginated-preview.tsx
│   │   ├── page-container.tsx
│   │   └── use-pagination.ts
│   ├── settings/
│   │   └── api-key-menu.tsx
│   └── common/
│       ├── error-boundary.tsx
│       └── resume_previewer_context.tsx
├── lib/
│   ├── api/                        # API client layer
│   │   ├── client.ts               # Base client (API_URL, fetch helpers)
│   │   ├── resume.ts               # Resume operations
│   │   ├── config.ts               # LLM config operations
│   │   └── index.ts                # Barrel exports
│   ├── context/
│   │   └── status-cache.tsx        # System status caching
│   ├── types/
│   │   └── template-settings.ts    # Template configuration types
│   ├── constants/
│   │   └── page-dimensions.ts      # A4/Letter dimensions, utilities
│   └── utils.ts                    # Utility functions (cn)
├── public/
│   └── fonts/                      # Custom fonts
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

---

## 2. Page Components & Routes

### 2.1 Landing Page (`/`)

**File:** `app/(default)/page.tsx`

| Component | Purpose |
|-----------|---------|
| `Hero` | Main hero section with CTA |
| `SwissGrid` | Grid container |

**Navigation:**
- Button: "Get Started" → `/dashboard`
- Button: "Settings" → `/settings`

### 2.2 Dashboard (`/dashboard`)

**File:** `app/(default)/dashboard/page.tsx`

**State:**
```typescript
masterResumeId: string | null          // From localStorage
processingStatus: ProcessingStatus     // loading | pending | processing | ready | failed
tailoredResumes: ResumeListItem[]      // From API
showDeleteDialog: boolean
```

**API Calls:**
| Function | When | Endpoint |
|----------|------|----------|
| `fetchResume(id)` | On mount if master exists | GET /resumes |
| `fetchResumeList(false)` | On mount, on focus | GET /resumes/list |
| `deleteResume(id)` | On delete confirm | DELETE /resumes/{id} |

**Status Cache Usage:**
```typescript
const { incrementResumes, decrementResumes, setHasMasterResume } = useStatusCache();
// Called on: upload complete, delete confirm
```

**Components:**
| Component | Purpose |
|-----------|---------|
| `SwissGrid` | Grid layout container |
| `ResumeUploadDialog` | File upload modal |
| `ConfirmDialog` | Delete confirmation |
| `Button` | Actions |

**UI Labels:**
| Element | Text |
|---------|------|
| Initialize card | "Initialize Master Resume" |
| Initialize subtitle | "// Initialize Sequence" |
| Master card | "Master Resume" |
| Status ready | "STATUS: READY" |
| Status processing | "STATUS: PROCESSING..." |
| Status failed | "STATUS: PROCESSING FAILED" |
| Create button label | "Create Resume" |
| Tailored card date | "Edited {date}" |

### 2.3 Resume Viewer (`/resumes/[id]`)

**File:** `app/(default)/resumes/[id]/page.tsx`

**State:**
```typescript
resumeData: ResumeData | null
loading: boolean
error: string | null
processingStatus: ProcessingStatus
isMasterResume: boolean               // Checked against localStorage
showDeleteDialog: boolean
showSuccessDialog: boolean
deleteError: string | null
```

**API Calls:**
| Function | When | Endpoint |
|----------|------|----------|
| `fetchResume(id)` | On mount | GET /resumes |
| `downloadResumePdf(id)` | On download click | GET /resumes/{id}/pdf |
| `deleteResume(id)` | On delete confirm | DELETE /resumes/{id} |

**Buttons:**
| Button | Label | Variant | Action |
|--------|-------|---------|--------|
| Back | "Back to Dashboard" | outline | Navigate to /dashboard |
| Edit | "Edit Resume" | outline | Navigate to /builder?id={id} |
| Download | "Download Resume" | success | Download PDF |
| Delete | "Delete Resume" / "Delete Master Resume" | destructive | Show confirm dialog |

### 2.4 Builder (`/builder`)

**File:** `app/(default)/builder/page.tsx` + `components/builder/resume-builder.tsx`

**State:**
```typescript
resumeData: ResumeData                 // Form data
templateSettings: TemplateSettings     // Template, margins, spacing
hasUnsavedChanges: boolean
isSaving: boolean
activeTab: 'resume' | 'cover-letter' | 'outreach'  // Current tab
coverLetter: string | null             // Cover letter content (if exists)
outreachMessage: string | null         // Outreach message content (if exists)
```

**Tabs Feature:**
The builder uses Windows 98 style tabs (RetroTabs component) to switch between:
- **RESUME** - Resume editor and preview
- **COVER LETTER** - Cover letter editor and preview (disabled if no cover letter)
- **OUTREACH MAIL** - Outreach message editor and preview (disabled if no outreach message)

Tabs are only enabled for tailored resumes that have generated cover letter/outreach content.

**Data Loading Priority:**
1. URL query param `?id=xyz` → Fetch from API
2. Context data (from tailor flow) → Use directly
3. localStorage draft → Restore
4. Defaults → Empty form

**localStorage Keys:**
| Key | Purpose |
|-----|---------|
| `resume_builder_draft` | Auto-saved resume data |
| `resume_builder_settings` | Template settings |

**API Calls:**
| Function | When | Endpoint |
|----------|------|----------|
| `fetchResume(id)` | On mount if id param | GET /resumes |
| `updateResume(id, data)` | On save | PATCH /resumes/{id} |
| `downloadResumePdf(id, settings)` | On download | GET /resumes/{id}/pdf |

**Subcomponents:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `ResumeForm` | Left panel | Form sections |
| `FormattingControls` | Left panel (collapsible) | Template & formatting |
| `PaginatedPreview` | Right panel | WYSIWYG preview |

**Panel Headers:**
| Panel | Indicator Color | Label |
|-------|-----------------|-------|
| Editor | `bg-blue-700` | "EDITOR PANEL" |
| Preview | `bg-green-700` | "LIVE PREVIEW" |

### 2.5 Tailor (`/tailor`)

**File:** `app/(default)/tailor/page.tsx`

**State:**
```typescript
jobDescription: string                 // JD input text
isProcessing: boolean
error: string | null
```

**API Calls:**
| Function | When | Endpoint |
|----------|------|----------|
| `uploadJobDescriptions([jd], masterId)` | On generate | POST /jobs/upload |
| `improveResume(masterId, jobId)` | After JD upload | POST /resumes/improve |

**Status Cache Usage:**
```typescript
const { incrementJobs, incrementImprovements, incrementResumes } = useStatusCache();
// Called after successful improve
```

**Navigation:**
- On success → `/resumes/{new_resume_id}`
- Back button → `/dashboard`

**UI Labels:**
| Element | Text |
|---------|------|
| Title | "TAILOR RESUME" |
| Subtitle | "// AI-POWERED OPTIMIZATION" |
| Textarea placeholder | "Paste the complete job description here..." |
| Button (idle) | "Generate Tailored Resume" |
| Button (processing) | "Analyzing..." |

### 2.6 Settings (`/settings`)

**File:** `app/(default)/settings/page.tsx`

**State:**
```typescript
status: 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'testing'
error: string | null
provider: LLMProvider
model: string
apiKey: string
apiBase: string
hasStoredApiKey: boolean
healthCheck: LLMHealthCheck | null
```

**Status Cache Usage:**
```typescript
const { status: systemStatus, isLoading, lastFetched, refreshStatus } = useStatusCache();
// Uses cached status instead of fetching on mount
```

**API Calls:**
| Function | When | Endpoint |
|----------|------|----------|
| `fetchLlmConfig()` | On mount | GET /config/llm-api-key |
| `updateLlmConfig(config)` | On save | PUT /config/llm-api-key |
| `testLlmConnection()` | On test click | POST /config/llm-test |
| `refreshStatus()` | On refresh click | GET /status |

**Provider Buttons:**
| Provider | Display Name |
|----------|--------------|
| openai | OpenAI |
| anthropic | Anthropic |
| openrouter | OpenRouter |
| gemini | Gemini |
| deepseek | DeepSeek |
| ollama | Ollama |

**UI Labels:**
| Element | Text |
|---------|------|
| Title | "SETTINGS" |
| Subtitle | "// SYSTEM CONFIGURATION" |
| Status panel | "System Status" |
| LLM panel | "LLM Configuration" |
| Last fetched | "{time} ago" / "Just now" / "Never" |
| Footer version | "RESUME MATCHER v2.0.0" |
| Status ready | "STATUS: READY" |
| Status setup | "STATUS: SETUP REQUIRED" |

### 2.7 Print Route (`/print/resumes/[id]`)

**File:** `app/print/resumes/[id]/page.tsx`

**Purpose:** Headless Chrome renders this page for PDF generation

**Query Params:**
| Param | Type | Default |
|-------|------|---------|
| template | string | swiss-single |
| pageSize | A4 \| LETTER | A4 |
| marginTop/Bottom/Left/Right | number | 10 |
| sectionSpacing/itemSpacing/lineHeight | 1-5 | 3/2/3 |
| fontSize/headerScale | 1-5 | 3/3 |

**Styling:**
- Applies margins via inline padding
- Uses exact page dimensions
- No navigation elements
- Class `.resume-print` for Playwright selector

### 2.8 Cover Letter Print Route (`/print/cover-letter/[id]`)

**File:** `app/print/cover-letter/[id]/page.tsx`

**Purpose:** Headless Chrome renders this page for cover letter PDF generation

**Query Params:**
| Param | Type | Default |
|-------|------|---------|
| pageSize | A4 \| LETTER | A4 |

**Data Flow:**
1. Page fetches resume data via API (`GET /resumes?resume_id={id}`)
2. Extracts `cover_letter` and `personalInfo` from response
3. Renders professional letter format

**Styling:**
- Class `.cover-letter-print` for Playwright selector
- Swiss typography (serif body, mono header)
- Professional letter layout with header, date, body

**Critical CSS Requirement:**

The print CSS in `globals.css` must whitelist `.cover-letter-print`:

```css
@media print {
  body * { visibility: hidden !important; }

  .resume-print,
  .resume-print *,
  .cover-letter-print,
  .cover-letter-print * {
    visibility: visible !important;
  }
}
```

**If this CSS rule is missing, Playwright will generate blank PDFs.**

---

## 3. Component Hierarchy

### 3.1 UI Components (`components/ui/`)

#### Button (`button.tsx`)

**Variants:**
| Variant | Color | Use Case |
|---------|-------|----------|
| `default` | Blue (#1D4ED8) | Primary actions (save, submit) |
| `destructive` | Red (#DC2626) | Delete, remove |
| `success` | Green (#15803D) | Download, confirm |
| `warning` | Orange (#F97316) | Reset, undo |
| `outline` | Transparent + border | Cancel, back |
| `secondary` | Grey (#E5E5E0) | Tertiary actions |
| `ghost` | No background | Icon buttons |
| `link` | Text only | Inline links |

**Sizes:**
| Size | Height | Padding |
|------|--------|---------|
| `default` | h-10 | px-6 py-2 |
| `sm` | h-8 | px-4 py-1 |
| `lg` | h-12 | px-8 py-3 |
| `icon` | h-10 w-10 | p-0 |

**Styling:**
- `rounded-none` (Swiss style)
- `shadow-[2px_2px_0px_0px_#000000]` (hard shadow)
- Hover: `translate-y-[1px] translate-x-[1px] shadow-none` (press effect)

#### Input (`input.tsx`)

**Styling:**
- `h-9 w-full`
- `border border-black`
- `rounded-none`
- Focus: `ring-1 ring-blue-700`

#### Textarea (`textarea.tsx`)

**Styling:**
- Same as Input
- `min-h-[80px]`
- `resize-none` (optional)

#### Label (`label.tsx`)

**Styling:**
- `font-mono text-sm`
- `uppercase tracking-wider`

#### Dialog (`dialog.tsx`)

**Based on:** Radix UI Dialog

**Parts:**
- `DialogTrigger` - Opens dialog
- `DialogContent` - Modal container
- `DialogHeader` - Title area
- `DialogTitle` - Heading
- `DialogDescription` - Subtext
- `DialogFooter` - Actions area
- `DialogClose` - Close trigger

#### ConfirmDialog (`confirm-dialog.tsx`)

**Props:**
```typescript
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'warning' | 'default' | 'success';
  icon?: React.ReactNode;
  showCancelButton?: boolean;
}
```

**Variant Styling:**
| Variant | Icon BG | Button Variant | Default Icon |
|---------|---------|----------------|--------------|
| danger | red-100 | destructive | Trash2 |
| warning | orange-100 | warning | AlertTriangle |
| success | green-100 | success | CheckCircle2 |
| default | blue-100 | default | AlertTriangle |

### 3.2 Resume Templates (`components/resume/`)

#### ResumeSingleColumn

**Layout:** Full-width vertical stack

**Sections Order:**
1. Header (name, title, contact)
2. Summary
3. Experience
4. Projects
5. Education
6. Skills & Awards

**CSS Classes:**
- `.resume-section` - Section container
- `.resume-section-title` - Section heading (h3)
- `.resume-items` - Items container
- `.resume-item` - Individual entry

#### ResumeTwoColumn

**Layout:** 65% main + 35% sidebar

**Main Column (Left):**
- Experience
- Projects
- Certifications/Training

**Sidebar (Right):**
- Summary
- Education
- Skills (as tags)
- Languages
- Awards
- Links

**CSS Classes:**
- `.resume-section-title-sm` - Smaller section heading for sidebar

### 3.3 Preview System (`components/preview/`)

#### PaginatedPreview

**Features:**
- Zoom controls (40%-150%)
- Margin guide toggle
- Page count display
- Scroll container for multiple pages

**Props:**
```typescript
interface PaginatedPreviewProps {
  resumeData: ResumeData;
  settings: TemplateSettings;
}
```

#### PageContainer

**Purpose:** Single page wrapper at exact dimensions

**Features:**
- Scaled to fit container
- Optional margin guides (dashed border)
- Page number indicator

#### usePagination Hook

**Purpose:** Calculate page breaks

**Logic:**
1. Render content in hidden container
2. Measure actual heights
3. Find page breaks respecting:
   - `.resume-section` boundaries
   - `.resume-item` boundaries
   - Minimum 50% page fill before break
4. Debounce calculations (150ms)

### 3.4 Form Components (`components/builder/forms/`)

| Form | Fields | Array Field? |
|------|--------|--------------|
| `personal-info-form.tsx` | name, title, email, phone, location, website, linkedin, github | No |
| `summary-form.tsx` | summary (textarea) | No |
| `experience-form.tsx` | title, company, location, years, description[] | Yes |
| `education-form.tsx` | institution, degree, years, description | Yes |
| `projects-form.tsx` | name, role, years, description[] | Yes |
| `additional-form.tsx` | technicalSkills[], languages[], certificationsTraining[], awards[] | Yes (all) |

**Array Field Pattern:**
```typescript
// Add item
const addItem = () => {
  onChange([...items, { id: nextId, ...defaults }]);
};

// Remove item
const removeItem = (id: number) => {
  onChange(items.filter(item => item.id !== id));
};

// Update item
const updateItem = (id: number, field: string, value: any) => {
  onChange(items.map(item =>
    item.id === id ? { ...item, [field]: value } : item
  ));
};
```

---

## 4. Context & State Management

### 4.1 StatusCacheProvider (`lib/context/status-cache.tsx`)

**Purpose:** Cache system status to avoid expensive LLM health checks

**Context Value:**
```typescript
interface StatusCacheContextValue {
  // Cached data
  status: SystemStatus | null;
  isLoading: boolean;
  error: string | null;
  lastFetched: Date | null;

  // Actions
  refreshStatus: () => Promise<void>;
  refreshLlmHealth: () => Promise<void>;

  // Optimistic counter updates
  incrementResumes: () => void;
  decrementResumes: () => void;
  incrementJobs: () => void;
  incrementImprovements: () => void;
  setHasMasterResume: (value: boolean) => void;
}
```

**Behavior:**
- Initial fetch on app start
- Auto-refresh every 30 minutes (background)
- Counter updates are optimistic (no API call)

**Usage in Pages:**
| Page | Functions Used |
|------|----------------|
| Dashboard | `incrementResumes`, `decrementResumes`, `setHasMasterResume` |
| Tailor | `incrementJobs`, `incrementImprovements`, `incrementResumes` |
| Settings | `status`, `isLoading`, `lastFetched`, `refreshStatus` |
| Resume Viewer | `decrementResumes`, `setHasMasterResume` |

### 4.2 ResumePreviewProvider (`components/common/resume_previewer_context.tsx`)

**Purpose:** Pass tailored resume data from tailor page to builder

**Context Value:**
```typescript
interface ResumePreviewContextValue {
  improvedData: ImprovedResult | null;
  setImprovedData: (data: ImprovedResult | null) => void;
}
```

**Flow:**
1. User generates tailored resume on `/tailor`
2. Result stored in context
3. Navigate to `/builder` or `/resumes/[id]`
4. Builder reads from context for initial data

### 4.3 localStorage Keys

| Key | Type | Purpose | Used By |
|-----|------|---------|---------|
| `master_resume_id` | string | Master resume UUID | Dashboard, Viewer, Tailor |
| `resume_builder_draft` | ResumeData (JSON) | Auto-saved form data | Builder |
| `resume_builder_settings` | TemplateSettings (JSON) | Template preferences | Builder |

---

## 5. API Client (`lib/api/`)

### 5.1 Base Client (`client.ts`)

```typescript
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
export const API_BASE = `${API_URL}/api/v1`;

export async function apiFetch(endpoint: string, options?: RequestInit): Promise<Response>;
export async function apiPost<T>(endpoint: string, body: T): Promise<Response>;
export async function apiPatch<T>(endpoint: string, body: T): Promise<Response>;
export async function apiPut<T>(endpoint: string, body: T): Promise<Response>;
export async function apiDelete(endpoint: string): Promise<Response>;
export function getUploadUrl(): string;  // Returns upload endpoint URL
```

### 5.2 Resume Operations (`resume.ts`)

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `uploadJobDescriptions(descriptions[], resumeId)` | POST | /jobs/upload | job_id string |
| `improveResume(resumeId, jobId)` | POST | /resumes/improve | ImprovedResult |
| `fetchResume(resumeId)` | GET | /resumes | ResumeResponse['data'] |
| `fetchResumeList(includeMaster)` | GET | /resumes/list | ResumeListItem[] |
| `updateResume(resumeId, data)` | PATCH | /resumes/{id} | ResumeResponse['data'] |
| `downloadResumePdf(resumeId, settings?)` | GET | /resumes/{id}/pdf | Blob |
| `deleteResume(resumeId)` | DELETE | /resumes/{id} | void |
| `updateCoverLetter(resumeId, content)` | PATCH | /resumes/{id}/cover-letter | void |
| `updateOutreachMessage(resumeId, content)` | PATCH | /resumes/{id}/outreach-message | void |
| `downloadCoverLetterPdf(resumeId, pageSize?)` | GET | /resumes/{id}/cover-letter/pdf | Blob |

### 5.3 Config Operations (`config.ts`)

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `fetchLlmConfig()` | GET | /config/llm-api-key | LLMConfig |
| `updateLlmConfig(config)` | PUT | /config/llm-api-key | LLMConfig |
| `testLlmConnection()` | POST | /config/llm-test | LLMHealthCheck |
| `fetchSystemStatus()` | GET | /status | SystemStatus |

**Provider Info Constant:**
```typescript
export const PROVIDER_INFO: Record<LLMProvider, {
  name: string;
  defaultModel: string;
  requiresKey: boolean;
}> = {
  openai: { name: 'OpenAI', defaultModel: 'gpt-4o-mini', requiresKey: true },
  anthropic: { name: 'Anthropic', defaultModel: 'claude-3-5-sonnet-20241022', requiresKey: true },
  openrouter: { name: 'OpenRouter', defaultModel: 'anthropic/claude-3.5-sonnet', requiresKey: true },
  gemini: { name: 'Google Gemini', defaultModel: 'gemini-1.5-flash', requiresKey: true },
  deepseek: { name: 'DeepSeek', defaultModel: 'deepseek-chat', requiresKey: true },
  ollama: { name: 'Ollama (Local)', defaultModel: 'llama3.2', requiresKey: false },
};
```

---

## 6. Types & Constants

### 6.1 Template Settings (`lib/types/template-settings.ts`)

```typescript
export type TemplateType = 'swiss-single' | 'swiss-two-column';
export type PageSize = 'A4' | 'LETTER';
export type SpacingLevel = 1 | 2 | 3 | 4 | 5;

export interface TemplateSettings {
  template: TemplateType;
  pageSize: PageSize;
  margins: { top: number; bottom: number; left: number; right: number };
  spacing: { section: SpacingLevel; item: SpacingLevel; lineHeight: SpacingLevel };
  fontSize: { base: SpacingLevel; headerScale: SpacingLevel };
}

export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings;
```

**CSS Variable Mappings:**
| Setting | CSS Variable | Values |
|---------|--------------|--------|
| spacing.section | --section-gap | 0.5rem - 2.5rem |
| spacing.item | --item-gap | 0.25rem - 1.25rem |
| spacing.lineHeight | --line-height | 1.2 - 1.8 |
| fontSize.base | --font-size-base | 11px - 16px |
| fontSize.headerScale | --header-scale | 1.5 - 2.5 |
| margins.* | --margin-* | 5mm - 25mm |

### 6.2 Page Dimensions (`lib/constants/page-dimensions.ts`)

```typescript
export const PAGE_DIMENSIONS = {
  A4: { width: 210, height: 297 },      // mm
  LETTER: { width: 215.9, height: 279.4 }, // mm
};

export function mmToPx(mm: number): number;   // At 96 DPI
export function pxToMm(px: number): number;
export function getContentArea(pageSize, margins): { width, height };
export function getContentAreaPx(pageSize, margins): { width, height };
export function calculatePreviewScale(pageWidthMm, containerWidthPx): number;
export function getPageDimensionsPx(pageSize): { width, height };
```

### 6.3 Resume Data Types

```typescript
export interface ResumeData {
  personalInfo?: PersonalInfo;
  summary?: string;
  workExperience?: Experience[];
  education?: Education[];
  personalProjects?: Project[];
  additional?: AdditionalInfo;
}

export interface PersonalInfo {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
}

export interface Experience {
  id: number;
  title?: string;
  company?: string;
  location?: string;
  years?: string;
  description?: string[];
}

export interface Education {
  id: number;
  institution?: string;
  degree?: string;
  years?: string;
  description?: string;
}

export interface Project {
  id: number;
  name?: string;
  role?: string;
  years?: string;
  description?: string[];
}

export interface AdditionalInfo {
  technicalSkills?: string[];
  languages?: string[];
  certificationsTraining?: string[];
  awards?: string[];
}
```

---

## 7. Styling Architecture

### 7.1 Design Tokens (Swiss Style)

**Colors:**
| Name | Value | Usage |
|------|-------|-------|
| Hyper Blue | #1D4ED8 (blue-700) | Primary actions, links |
| Signal Green | #15803D (green-700) | Success, download |
| Alert Red | #DC2626 (red-600) | Destructive actions |
| Alert Orange | #F97316 (orange-500) | Warnings |
| Warm White | #F0F0E8 | Background |
| Panel Grey | #E5E5E0 | Secondary backgrounds |
| Black | #000000 | Text, borders |

**Typography:**
| Element | Font | Style |
|---------|------|-------|
| Headers | `font-serif` (Merriweather) | Bold, uppercase |
| Body | `font-sans` (Inter) | Regular |
| Code/Labels | `font-mono` (JetBrains Mono) | Uppercase, tracking-wider |

**Shadows:**
| Size | Value | Usage |
|------|-------|-------|
| Swiss-lg | `8px 8px 0px 0px rgba(0,0,0,0.1)` | Cards, dialogs |
| Swiss-md | `4px 4px 0px 0px #000000` | Buttons, inputs |
| Swiss-sm | `2px 2px 0px 0px #000000` | Small elements |

**Borders:**
- All corners: `rounded-none`
- Border color: `border-black`
- Border width: `border` or `border-2`

### 7.2 CSS Custom Properties (Resume Templates)

```css
:root {
  --section-gap: 1.5rem;
  --item-gap: 0.5rem;
  --line-height: 1.5;
  --font-size-base: 14px;
  --header-scale: 2;
  --margin-top: 10mm;
  --margin-bottom: 10mm;
  --margin-left: 10mm;
  --margin-right: 10mm;
}

.resume-section {
  margin-top: var(--section-gap);
}

.resume-section-title {
  font-size: calc(var(--font-size-base) * 1.2);
  font-weight: bold;
  text-transform: uppercase;
  border-bottom: 2px solid black;
  padding-bottom: 0.25rem;
  margin-bottom: var(--item-gap);
}

.resume-items {
  display: flex;
  flex-direction: column;
  gap: var(--item-gap);
}

.resume-item {
  break-inside: avoid;
}
```

### 7.3 Print Styles

```css
@media print {
  .no-print { display: none !important; }
  .resume-print {
    width: 100%;
    box-shadow: none;
    border: none;
  }
}
```

---

## 8. Extension Points for i18n

### 8.1 Text Locations Requiring Translation

| Category | Files | Example Text |
|----------|-------|--------------|
| Page titles | All page.tsx | "SETTINGS", "TAILOR RESUME" |
| Button labels | All pages | "Save", "Download", "Delete" |
| Status messages | dashboard, settings | "STATUS: READY", "CHECKING..." |
| Form labels | forms/*.tsx | "Company", "Title", "Years" |
| Error messages | All pages | "Failed to load resume" |
| Dialog content | confirm-dialog uses | "Delete Resume", "Are you sure?" |
| Placeholders | forms, tailor | "Enter your email...", "Paste job description..." |

### 8.2 Recommended i18n Implementation

1. **Create translations directory:**
   ```
   lib/i18n/
   ├── index.ts          # Translation hooks
   ├── locales/
   │   ├── en.json
   │   ├── es.json
   │   └── ...
   └── types.ts
   ```

2. **Translation hook pattern:**
   ```typescript
   // lib/i18n/index.ts
   export function useTranslation() {
     const locale = useLocale();
     return {
       t: (key: string) => translations[locale][key] || key,
     };
   }
   ```

3. **Usage in components:**
   ```typescript
   const { t } = useTranslation();
   <Button>{t('common.save')}</Button>
   ```

### 8.3 i18n-Ready Component Pattern

```typescript
// Before
<Button>Save Configuration</Button>

// After
<Button>{t('settings.save')}</Button>

// locales/en.json
{
  "settings": {
    "save": "Save Configuration",
    "title": "SETTINGS",
    ...
  }
}
```

---

## 9. Extension Points for Templates

### 9.1 Adding New Resume Templates

1. **Create template component:**
   ```
   components/resume/resume-{name}.tsx
   ```

2. **Export from index:**
   ```typescript
   // components/resume/index.ts
   export { ResumeSingleColumn } from './resume-single-column';
   export { ResumeTwoColumn } from './resume-two-column';
   export { ResumeNewTemplate } from './resume-new-template';
   ```

3. **Add to template options:**
   ```typescript
   // lib/types/template-settings.ts
   export type TemplateType = 'swiss-single' | 'swiss-two-column' | 'new-template';

   export const TEMPLATE_OPTIONS: TemplateInfo[] = [
     { id: 'swiss-single', name: 'Single Column', description: '...' },
     { id: 'swiss-two-column', name: 'Two Column', description: '...' },
     { id: 'new-template', name: 'New Template', description: '...' },
   ];
   ```

4. **Update Resume component:**
   ```typescript
   // components/dashboard/resume-component.tsx
   {mergedSettings.template === 'new-template' && <ResumeNewTemplate data={resumeData} />}
   ```

### 9.2 Template Component Requirements

Each template must:
- Accept `data: ResumeData` prop
- Use CSS variables for spacing/fonts
- Include `.resume-section`, `.resume-item` classes for pagination
- Handle optional fields gracefully

---

## 10. Function Reference by Trigger

### 10.1 User Actions → API Calls

| User Action | Page | API Function | Endpoint |
|-------------|------|--------------|----------|
| Upload resume file | Dashboard | (fetch API) | POST /resumes/upload |
| View resume | Dashboard | `fetchResume()` | GET /resumes |
| Delete resume | Viewer | `deleteResume()` | DELETE /resumes/{id} |
| Edit resume | Viewer → Builder | `fetchResume()` | GET /resumes |
| Save resume edits | Builder | `updateResume()` | PATCH /resumes/{id} |
| Download resume PDF | Viewer/Builder | `downloadResumePdf()` | GET /resumes/{id}/pdf |
| Download cover letter PDF | Builder | `downloadCoverLetterPdf()` | GET /resumes/{id}/cover-letter/pdf |
| Save cover letter | Builder | `updateCoverLetter()` | PATCH /resumes/{id}/cover-letter |
| Save outreach message | Builder | `updateOutreachMessage()` | PATCH /resumes/{id}/outreach-message |
| Submit job description | Tailor | `uploadJobDescriptions()` | POST /jobs/upload |
| Generate tailored resume | Tailor | `improveResume()` | POST /resumes/improve |
| Save LLM config | Settings | `updateLlmConfig()` | PUT /config/llm-api-key |
| Test LLM connection | Settings | `testLlmConnection()` | POST /config/llm-test |
| Refresh status | Settings | `refreshStatus()` | GET /status |

### 10.2 Auto-Triggers

| Trigger | Page | Action |
|---------|------|--------|
| Page mount | Dashboard | Load tailored resumes, check master status |
| Window focus | Dashboard | Refresh resume list |
| Page mount | Builder | Load resume data (API/context/localStorage) |
| Form change | Builder | Auto-save to localStorage |
| Page mount | Settings | Load LLM config |
| 30-minute interval | App-wide | Refresh LLM health status |

---

*This document is part of the Resume Matcher technical documentation. See also: backend-architecture.md, design-system.md, api-flow-maps.md*
