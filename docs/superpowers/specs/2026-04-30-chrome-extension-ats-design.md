# Chrome Extension — ATS Screen Design

**Goal:** A Manifest V3 Chrome extension that detects job listings on LinkedIn, Indeed, and Glassdoor, injects an "ATS Screen" button next to the apply button, and shows a scored result (PASS / BORDERLINE / REJECT) in a toolbar popup — all backed by the existing Resume Matcher ATS API.

**Architecture:** Content scripts extract job descriptions per site; a service worker handles all API calls; the popup renders results. Language requirements and visa sponsorship are parsed locally from the JD text (no extra LLM call). The backend requires one CORS change — no new endpoints.

**Tech stack:** Manifest V3, vanilla JS (no framework — keeps the extension small and fast), `chrome.storage.local`, existing FastAPI `/api/v1/ats/screen` endpoint.

---

## File Structure

```
apps/extension/
├── manifest.json
├── background.js               # Service worker — API calls, storage
├── content/
│   ├── linkedin.js             # LinkedIn JD extractor + button injector
│   ├── indeed.js               # Indeed JD extractor + button injector
│   ├── glassdoor.js            # Glassdoor JD extractor + button injector
│   └── generic.js              # Fallback heuristic extractor
├── popup/
│   ├── popup.html
│   └── popup.js
├── options/
│   ├── options.html
│   └── options.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## manifest.json

```json
{
  "manifest_version": 3,
  "name": "Resume Matcher — ATS Screen",
  "version": "1.0.0",
  "description": "Score your resume against any job description without leaving the page.",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://www.indeed.com/*",
    "https://www.glassdoor.com/*"
  ],
  "background": { "service_worker": "background.js" },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png" }
  },
  "options_page": "options/options.html",
  "content_scripts": [
    {
      "matches": ["https://www.linkedin.com/jobs/view/*"],
      "js": ["content/linkedin.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://www.indeed.com/viewjob*"],
      "js": ["content/indeed.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://www.glassdoor.com/job-listing/*"],
      "js": ["content/glassdoor.js"],
      "run_at": "document_idle"
    }
  ]
}
```

---

## Storage Schema

Stored in `chrome.storage.local`. All fields are optional on first install.

```js
{
  lastResumeId: "uuid-string",         // ID of last-used resume
  lastResumeTitle: "Senior PM Resume", // Display name shown in popup selector
  backendUrl: "http://localhost:8000", // API backend URL; user can override in options
  frontendUrl: "http://localhost:3000",// Frontend app URL; used for "View Full Results"
  pendingAtsResult: { ... } | null     // Temporary handoff to the ATS page; cleared after read
}
```

---

## Component Specifications

### 1. Content Scripts (one per site)

Each content script does two things: extract the job description and inject the floating button.

**JD extraction — selectors per site:**

| Site | Primary selector | Fallback |
|---|---|---|
| LinkedIn | `.jobs-description__content` | `.jobs-description` |
| Indeed | `#jobDescriptionText` | `.jobsearch-jobDescriptionText` |
| Glassdoor | `[class*="JobDescription_jobDescription"]` | `[data-test="jobDescriptionText"]` |
| Generic | Largest `<div>` or `<section>` with >200 characters of text | — |

**Button injection:**

Each content script locates the "Apply" button container and appends the ATS button immediately after it. If the container is not found within 3 seconds (LinkedIn uses dynamic rendering), a `MutationObserver` waits for it.

Button HTML injected into the page:
```html
<button id="rm-ats-btn" style="
  display:inline-flex; align-items:center; gap:6px;
  background:#1D4ED8; color:white; border:none; cursor:pointer;
  padding:7px 14px; border-radius:20px; font-size:12px; font-weight:700;
  box-shadow:0 2px 6px rgba(29,78,216,0.35);
">
  <svg width="13" height="13" ...>✓</svg>
  ATS Screen
</button>
```

When clicked, the button:
1. Stores the extracted JD text via `chrome.runtime.sendMessage({ type: 'JOB_SELECTED' })` so the service worker writes it to `chrome.storage.local`
2. Briefly changes its label to "✓ Ready — click toolbar icon" for 2 seconds to guide the user

Note: MV3 service workers cannot programmatically open the popup. The user clicks the toolbar icon to open it; the popup reads the pre-cached JD from storage.

**Message sent to service worker when page loads (to pre-cache the JD):**
```js
chrome.runtime.sendMessage({
  type: 'JOB_DETECTED',
  payload: { jobText: string, jobTitle: string, company: string }
})
```

---

### 2. Service Worker (background.js)

Handles all cross-origin API calls (content scripts cannot call the backend directly due to CORS).

**Messages it handles:**

| Message type | Action |
|---|---|
| `JOB_DETECTED` | Stores `{ currentJobText, currentJobTitle, currentCompany }` in `chrome.storage.local` |
| `RUN_SCREEN` | Calls `/api/v1/ats/screen`, returns result to popup |
| `GET_RESUMES` | Calls `/api/v1/resumes` to populate the resume selector |
| `GET_STATE` | Returns `{ currentJob, lastResume, backendUrl }` to popup on open |

**`RUN_SCREEN` flow:**
```
popup sends RUN_SCREEN { resumeId, jobText }
  → service worker reads backendUrl from storage
  → POST {backendUrl}/api/v1/ats/screen
      body: { resume_id: resumeId, job_description: jobText, save_optimized: false }
  → parse response
  → run parseLanguages(jobText) and parseVisa(jobText) locally
  → return { score, decision, keywordTable, missingKeywords, languages, visa } to popup
```

**Error handling:**
- Backend unreachable: return `{ error: 'BACKEND_OFFLINE' }` → popup shows "Resume Matcher is not running. Start the backend and try again."
- No resume selected: return `{ error: 'NO_RESUME' }` → popup shows the resume selector with a prompt
- No job detected: return `{ error: 'NO_JOB' }` → popup shows "Navigate to a job listing first."

---

### 3. Local Parsers (runs inside service worker)

These run on the raw JD text — no LLM, instant results.

**`parseLanguages(text)`**

Scans for language names (English, German, French, Spanish, Mandarin, Dutch, etc.) within 60 characters of trigger words ("fluent", "native", "required", "proficiency", "C1", "B2", etc.).

Returns:
```js
[
  { language: "German", level: "C1", required: true },
  { language: "English", level: "Professional", required: true }
]
// Empty array if no languages detected
```

**`parseVisa(text)`**

Checks for explicit patterns:

- `'available'` — matches: "visa sponsorship", "sponsor work visa", "relocation assistance"
- `'not_available'` — matches: "no sponsorship", "not able to sponsor", "must be authorized", "must have right to work", "no visa"
- `'unclear'` — no visa-related language found

Returns one of: `'available' | 'not_available' | 'unclear'`

---

### 4. Popup (popup.html + popup.js)

**States the popup moves through:**

```
LOADING → NO_JOB (if no job detected)
        → READY  (job detected, resume pre-selected or needs selection)
             ↓ user clicks Run
        → SCORING (spinner)
             ↓ response received
        → RESULTS
             ↓ user clicks View Full Results
        → (new tab opens Resume Matcher app)
```

**READY state UI:**
- Dark header: "RESUME MATCHER · ATS" + settings gear
- Resume row: last-used resume pre-selected in a dropdown; user can open dropdown to switch
- Green pill: "Job detected: [title] · [company]"
- Blue "Run ATS Screen" button

**RESULTS state UI (as designed in mockups):**
- PASS / BORDERLINE / REJECT badge + score /100
- Score bar (gradient)
- Score breakdown grid: Skills /30, Experience /25, Domain /20, Tools /15
- Language requirements section (blue box, one row per language with flag + level + REQUIRED/PREFERRED badge)
- Visa sponsorship section: ✅ Available (green) / 🚫 Not available (red) / ❓ Unclear (grey)
- Missing keywords chips (top 5, "+N more" if >5)
- "View Full Results →" button

**"View Full Results" behaviour:**
Opens `http://localhost:3000/ats` (or the frontend URL stored in options) in a new tab. Before opening, the service worker writes the full result object to `chrome.storage.local` under the key `pendingAtsResult`. The ATS page checks for this key on load, renders the results immediately, then deletes the key. This avoids re-running the LLM screen.

**Resume selector behaviour:**
- On first install: dropdown shows all resumes fetched from `/api/v1/resumes`, prompts user to pick one
- On subsequent opens: last-used resume is pre-selected; dropdown is collapsed but tappable to switch
- After switching: new selection saved to `chrome.storage.local` immediately

---

### 5. Options Page (options.html + options.js)

Two fields only:

| Field | Default | Description |
|---|---|---|
| Backend URL | `http://localhost:8000` | Where the Resume Matcher API runs |
| Frontend URL | `http://localhost:3000` | Where the Resume Matcher app runs (for "View Full Results") |
| Default resume | (last used) | Pre-select a resume without opening popup |

Saves to `chrome.storage.local` on change. Shows a "Test connection" button that hits `{backendUrl}/api/v1/status` and displays ✅ Connected or ❌ Unreachable.

---

## Backend Change

One addition to `apps/backend/app/main.py` — add `chrome-extension://*` to the CORS allowed origins list:

```python
# In the CORSMiddleware configuration:
allow_origins=[
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "chrome-extension://*",   # ← add this
]
```

No new endpoints. The extension uses the existing `/api/v1/ats/screen` and `/api/v1/resumes` endpoints.

---

## Error States

| Situation | Popup message |
|---|---|
| Backend not running | "Resume Matcher is not running. Start the backend at [url] and try again." |
| On a non-job page | "Navigate to a job listing on LinkedIn, Indeed, or Glassdoor." |
| No resume selected yet | "Select a resume to get started." (shows dropdown) |
| API returns error | "Screening failed: [error message]. Check the backend logs." |
| JD extraction fails | "Couldn't extract the job description. Try copying it manually." |

---

## What Is Not in Scope (v1)

- Score history / caching previous results
- Safari or Firefox support
- Automatic re-screen when the JD changes
- Saving the optimized resume from the popup (`save_optimized` is always `false`)
- Support for job boards beyond LinkedIn, Indeed, Glassdoor (generic fallback exists but is best-effort)
