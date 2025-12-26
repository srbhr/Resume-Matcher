# Internationalization (i18n) Preparation Guide

This document provides a comprehensive guide for implementing multiple language support in the Resume Matcher application. It catalogs all text strings that need translation and outlines the recommended implementation approach.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Recommended i18n Stack](#2-recommended-i18n-stack)
3. [Frontend Text Extraction](#3-frontend-text-extraction)
4. [Backend Text Extraction](#4-backend-text-extraction)
5. [LLM Prompt Localization](#5-llm-prompt-localization)
6. [Implementation Steps](#6-implementation-steps)
7. [Translation File Structure](#7-translation-file-structure)
8. [Testing Strategy](#8-testing-strategy)

---

## 1. Overview

### Scope of Localization

| Layer | Type | Complexity |
|-------|------|------------|
| Frontend UI | Labels, buttons, messages | Medium |
| Frontend Validation | Error messages | Low |
| Backend Errors | API error messages | Low |
| LLM Prompts | Resume parsing/improvement | High |
| Generated Content | Resume output text | High |

### Language Priority (Suggested)

1. **English (en)** - Default, already implemented
2. **Spanish (es)** - Large user base
3. **French (fr)** - International reach
4. **German (de)** - European market
5. **Portuguese (pt)** - Brazil market
6. **Chinese Simplified (zh-CN)** - Asian market
7. **Hindi (hi)** - Indian market

---

## 2. Recommended i18n Stack

### Frontend: next-intl

```bash
npm install next-intl
```

**Why next-intl:**
- Native Next.js App Router support
- Type-safe translations
- Server and client component support
- ICU message format
- Pluralization and formatting

### Backend: Python-i18n or custom

```bash
pip install python-i18n
```

**Alternative:** Simple JSON-based custom solution for the limited backend strings.

---

## 3. Frontend Text Extraction

### 3.1 Page-Level Text Strings

#### Dashboard (`app/(default)/dashboard/page.tsx`)

```typescript
// Current hardcoded strings
const strings = {
  // Page title
  "dashboard.title": "Dashboard",

  // Master Resume Card
  "dashboard.masterResume.title": "Master Resume",
  "dashboard.masterResume.initialize": "Initialize Master Resume",
  "dashboard.masterResume.processing": "Processing...",
  "dashboard.masterResume.ready": "Ready",
  "dashboard.masterResume.failed": "Failed",

  // Create Resume Card
  "dashboard.createResume.label": "Create Resume",
  "dashboard.createResume.disabled": "Upload master resume first",

  // Resume Grid
  "dashboard.resumeGrid.empty": "No tailored resumes yet",
  "dashboard.resumeGrid.tailored": "Tailored Resume",

  // Upload Dialog
  "dashboard.upload.title": "Upload Master Resume",
  "dashboard.upload.description": "Upload your base resume (PDF or DOCX)",
  "dashboard.upload.dropzone": "Drop file here or click to browse",
  "dashboard.upload.formats": "Supported formats: PDF, DOCX",
  "dashboard.upload.uploading": "Uploading...",
  "dashboard.upload.success": "Resume uploaded successfully",
  "dashboard.upload.error": "Failed to upload resume",
};
```

#### Settings (`app/(default)/settings/page.tsx`)

```typescript
const strings = {
  // Page title
  "settings.title": "Settings",

  // System Status Panel
  "settings.status.title": "System Status",
  "settings.status.llm": "LLM Status",
  "settings.status.database": "Database Status",
  "settings.status.resumes": "Resumes",
  "settings.status.jobs": "Jobs",
  "settings.status.improvements": "Improvements",
  "settings.status.masterResume": "Master Resume",
  "settings.status.lastFetched": "Last Fetched",
  "settings.status.refresh": "Refresh",
  "settings.status.healthy": "HEALTHY",
  "settings.status.offline": "OFFLINE",
  "settings.status.connected": "CONNECTED",
  "settings.status.configured": "CONFIGURED",
  "settings.status.notSet": "NOT SET",

  // LLM Configuration Panel
  "settings.llm.title": "LLM Configuration",
  "settings.llm.provider": "Provider",
  "settings.llm.model": "Model",
  "settings.llm.apiKey": "API Key",
  "settings.llm.ollamaUrl": "Ollama Server URL",
  "settings.llm.save": "Save Configuration",
  "settings.llm.test": "Test Connection",
  "settings.llm.saving": "Saving...",
  "settings.llm.testing": "Testing...",
  "settings.llm.saveSuccess": "Configuration saved",
  "settings.llm.saveError": "Failed to save configuration",
  "settings.llm.testSuccess": "Connection successful",
  "settings.llm.testError": "Connection failed",

  // Status Footer
  "settings.footer.ready": "STATUS: READY",
  "settings.footer.setupRequired": "STATUS: SETUP REQUIRED",
  "settings.footer.checking": "CHECKING...",
  "settings.footer.offline": "STATUS: OFFLINE",
};
```

#### Tailor Page (`app/(default)/tailor/page.tsx`)

```typescript
const strings = {
  // Page title
  "tailor.title": "Tailor Resume",

  // Job Description Input
  "tailor.jd.label": "Job Description",
  "tailor.jd.placeholder": "Paste the job description here...",
  "tailor.jd.minChars": "Minimum 50 characters required",
  "tailor.jd.charCount": "{count} characters",

  // Actions
  "tailor.submit": "Tailor Resume",
  "tailor.submitting": "Tailoring...",
  "tailor.cancel": "Cancel",

  // Progress
  "tailor.progress.uploading": "Uploading job description...",
  "tailor.progress.analyzing": "Analyzing job requirements...",
  "tailor.progress.improving": "Optimizing your resume...",
  "tailor.progress.complete": "Done!",

  // Errors
  "tailor.error.noMaster": "No master resume found",
  "tailor.error.failed": "Failed to tailor resume",
};
```

#### Resume Viewer (`app/(default)/resumes/[id]/page.tsx`)

```typescript
const strings = {
  // Navigation
  "viewer.back": "Back to Dashboard",

  // Status Messages
  "viewer.status.loading": "Loading resume...",
  "viewer.status.processing": "Resume is being processed...",
  "viewer.status.failed": "Resume processing failed",

  // Actions
  "viewer.actions.edit": "Edit Resume",
  "viewer.actions.download": "Download PDF",
  "viewer.actions.delete": "Delete Resume",

  // Delete Confirmation
  "viewer.delete.title": "Delete Resume",
  "viewer.delete.titleMaster": "Delete Master Resume",
  "viewer.delete.description": "This action cannot be undone.",
  "viewer.delete.confirm": "Delete Resume",
  "viewer.delete.cancel": "Keep Resume",
  "viewer.delete.success": "Resume Deleted",
  "viewer.delete.successMessage": "The resume has been permanently deleted.",
  "viewer.delete.return": "Return to Dashboard",
  "viewer.delete.error": "Failed to delete resume",
};
```

#### Resume Builder (`app/(default)/builder/page.tsx`)

```typescript
const strings = {
  // Navigation
  "builder.back": "Back to Dashboard",

  // Panel Headers
  "builder.editor.title": "EDITOR PANEL",
  "builder.preview.title": "LIVE PREVIEW",

  // Formatting Controls
  "builder.formatting.title": "Template & Formatting",
  "builder.formatting.template": "Template",
  "builder.formatting.pageSize": "Page Size",
  "builder.formatting.margins": "Margins",
  "builder.formatting.marginTop": "Top",
  "builder.formatting.marginBottom": "Bottom",
  "builder.formatting.marginLeft": "Left",
  "builder.formatting.marginRight": "Right",
  "builder.formatting.spacing": "Spacing",
  "builder.formatting.sectionSpacing": "Section Spacing",
  "builder.formatting.itemSpacing": "Item Spacing",
  "builder.formatting.lineHeight": "Line Height",
  "builder.formatting.fontSize": "Font Size",
  "builder.formatting.headerScale": "Header Scale",

  // Templates
  "builder.template.singleColumn": "Single Column",
  "builder.template.twoColumn": "Two Column",

  // Actions
  "builder.actions.save": "Save",
  "builder.actions.saving": "Saving...",
  "builder.actions.reset": "Reset",
  "builder.actions.download": "Download PDF",
  "builder.actions.downloading": "Downloading...",

  // Status
  "builder.status.unsaved": "Unsaved changes",
  "builder.status.saved": "All changes saved",
  "builder.status.error": "Error saving changes",

  // Preview Controls
  "builder.preview.zoom": "Zoom",
  "builder.preview.margins": "Show Margins",
  "builder.preview.pages": "{count} page(s)",
};
```

### 3.2 Component-Level Text Strings

#### Resume Form (`components/builder/resume-form.tsx`)

```typescript
const strings = {
  // Section Headers
  "form.personalInfo.title": "Personal Information",
  "form.experience.title": "Experience",
  "form.education.title": "Education",
  "form.projects.title": "Projects",
  "form.skills.title": "Skills",
  "form.additional.title": "Additional Information",

  // Personal Info Fields
  "form.personalInfo.name": "Full Name",
  "form.personalInfo.email": "Email",
  "form.personalInfo.phone": "Phone",
  "form.personalInfo.location": "Location",
  "form.personalInfo.linkedin": "LinkedIn URL",
  "form.personalInfo.github": "GitHub URL",
  "form.personalInfo.website": "Website URL",
  "form.personalInfo.summary": "Professional Summary",

  // Experience Fields
  "form.experience.add": "Add Experience",
  "form.experience.remove": "Remove",
  "form.experience.title": "Job Title",
  "form.experience.company": "Company",
  "form.experience.location": "Location",
  "form.experience.startDate": "Start Date",
  "form.experience.endDate": "End Date",
  "form.experience.current": "Current Position",
  "form.experience.description": "Description",
  "form.experience.bullets": "Key Achievements",
  "form.experience.addBullet": "Add Achievement",

  // Education Fields
  "form.education.add": "Add Education",
  "form.education.remove": "Remove",
  "form.education.degree": "Degree",
  "form.education.institution": "Institution",
  "form.education.location": "Location",
  "form.education.graduationDate": "Graduation Date",
  "form.education.gpa": "GPA",
  "form.education.honors": "Honors",

  // Project Fields
  "form.projects.add": "Add Project",
  "form.projects.remove": "Remove",
  "form.projects.name": "Project Name",
  "form.projects.description": "Description",
  "form.projects.technologies": "Technologies",
  "form.projects.url": "Project URL",
  "form.projects.bullets": "Key Points",
  "form.projects.addBullet": "Add Point",

  // Skills Fields
  "form.skills.placeholder": "Enter skills separated by commas",
};
```

#### Confirm Dialog (`components/ui/confirm-dialog.tsx`)

```typescript
const strings = {
  "dialog.confirm.default": "Confirm",
  "dialog.confirm.cancel": "Cancel",
  "dialog.confirm.ok": "OK",
};
```

#### Button Labels (Various)

```typescript
const strings = {
  "button.save": "Save",
  "button.cancel": "Cancel",
  "button.delete": "Delete",
  "button.edit": "Edit",
  "button.download": "Download",
  "button.upload": "Upload",
  "button.submit": "Submit",
  "button.back": "Back",
  "button.next": "Next",
  "button.close": "Close",
  "button.retry": "Retry",
  "button.refresh": "Refresh",
};
```

### 3.3 Validation Messages

```typescript
const strings = {
  "validation.required": "This field is required",
  "validation.email": "Please enter a valid email address",
  "validation.url": "Please enter a valid URL",
  "validation.minLength": "Minimum {min} characters required",
  "validation.maxLength": "Maximum {max} characters allowed",
  "validation.phone": "Please enter a valid phone number",
};
```

### 3.4 Date and Time Formatting

```typescript
const strings = {
  "date.justNow": "Just now",
  "date.minutesAgo": "{count}m ago",
  "date.hoursAgo": "{count}h ago",
  "date.daysAgo": "{count}d ago",
  "date.present": "Present",
};
```

---

## 4. Backend Text Extraction

### 4.1 API Error Messages

#### Resume Router (`routers/resumes.py`)

```python
error_messages = {
    "resume.notFound": "Resume not found",
    "resume.processingFailed": "Failed to process resume",
    "resume.uploadFailed": "Failed to upload resume",
    "resume.invalidFormat": "Invalid file format. Supported: PDF, DOCX",
    "resume.tooLarge": "File too large. Maximum size: 10MB",
    "resume.updateFailed": "Failed to update resume",
    "resume.deleteFailed": "Failed to delete resume",
    "resume.pdfFailed": "Failed to generate PDF",
}
```

#### Job Router (`routers/jobs.py`)

```python
error_messages = {
    "job.notFound": "Job description not found",
    "job.uploadFailed": "Failed to upload job description",
    "job.invalidInput": "Invalid job description",
}
```

#### Config Router (`routers/config.py`)

```python
error_messages = {
    "config.invalidProvider": "Invalid LLM provider",
    "config.invalidApiKey": "Invalid API key",
    "config.connectionFailed": "Failed to connect to LLM provider",
    "config.updateFailed": "Failed to update configuration",
}
```

#### Health Router (`routers/health.py`)

```python
error_messages = {
    "health.llmOffline": "LLM service is offline",
    "health.databaseError": "Database connection error",
}
```

### 4.2 Status Messages

```python
status_messages = {
    "status.pending": "Pending",
    "status.processing": "Processing",
    "status.ready": "Ready",
    "status.failed": "Failed",
    "status.healthy": "Healthy",
    "status.offline": "Offline",
    "status.connected": "Connected",
    "status.configured": "Configured",
}
```

---

## 5. LLM Prompt Localization

### 5.1 Current Prompts Location

All LLM prompts are in `apps/backend/app/prompts/templates.py`

### 5.2 Prompts Requiring Localization

#### PARSE_RESUME_PROMPT

```python
# Current English prompt (lines 5-50)
PARSE_RESUME_PROMPT = """
Extract the following information from this resume and return as JSON:

{schema}

Resume text:
{text}

Return a valid JSON object with the extracted information.
"""

# Need locale-specific versions for:
# - Instructions to the LLM
# - Expected output field names (if displayed)
# - Date format expectations
```

#### EXTRACT_KEYWORDS_PROMPT

```python
# Current English prompt (lines 55-85)
EXTRACT_KEYWORDS_PROMPT = """
Analyze this job description and extract:
1. Required skills
2. Preferred qualifications
3. Key responsibilities
4. Industry keywords

Job Description:
{job_description}

Return as JSON with keys: skills, qualifications, responsibilities, keywords
"""
```

#### IMPROVE_RESUME_PROMPT

```python
# Current English prompt (lines 90-150)
IMPROVE_RESUME_PROMPT = """
Improve this resume to better match the job requirements.

Original Resume:
{resume_json}

Job Keywords:
{job_keywords}

Guidelines:
- Highlight relevant experience
- Use industry keywords naturally
- Quantify achievements where possible
- Keep the same structure

Return the improved resume as JSON in the same format.
"""
```

### 5.3 Multi-Language Prompt Strategy

**Option A: Translate prompts per language**
```python
PROMPTS = {
    "en": {
        "parse_resume": "Extract the following...",
        "extract_keywords": "Analyze this job...",
        "improve_resume": "Improve this resume...",
    },
    "es": {
        "parse_resume": "Extraer la siguiente información...",
        "extract_keywords": "Analizar esta descripción...",
        "improve_resume": "Mejorar este currículum...",
    },
}
```

**Option B: Keep English prompts, add output language instruction**
```python
IMPROVE_RESUME_PROMPT = """
Improve this resume to better match the job requirements.
Output the improved resume in {output_language}.

...
"""
```

**Recommended:** Option B for simplicity. LLMs understand English prompts well, and we only need to localize the output.

---

## 6. Implementation Steps

### Phase 1: Frontend Setup (Week 1)

```bash
# 1. Install next-intl
npm install next-intl

# 2. Create folder structure
mkdir -p apps/frontend/messages
touch apps/frontend/messages/en.json
touch apps/frontend/messages/es.json
touch apps/frontend/messages/fr.json

# 3. Create i18n configuration
touch apps/frontend/i18n.ts
touch apps/frontend/middleware.ts
```

#### i18n Configuration (`i18n.ts`)

```typescript
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`./messages/${locale}.json`)).default,
}));
```

#### Middleware (`middleware.ts`)

```typescript
import createMiddleware from "next-intl/middleware";

export default createMiddleware({
  locales: ["en", "es", "fr", "de", "pt", "zh-CN", "hi"],
  defaultLocale: "en",
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
```

### Phase 2: Extract Strings (Week 2)

1. **Audit all pages** for hardcoded text
2. **Create JSON files** with extracted strings
3. **Replace hardcoded text** with `useTranslations()` hook

#### Example Transformation

**Before:**
```tsx
export function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Button>Create Resume</Button>
    </div>
  );
}
```

**After:**
```tsx
import { useTranslations } from "next-intl";

export function Dashboard() {
  const t = useTranslations("dashboard");
  return (
    <div>
      <h1>{t("title")}</h1>
      <Button>{t("createResume.label")}</Button>
    </div>
  );
}
```

### Phase 3: Backend Localization (Week 3)

1. **Create locale parameter** for API endpoints
2. **Load language files** for error messages
3. **Update LLM prompts** with output language

#### API Locale Header

```python
from fastapi import Header

@router.get("/resumes/{resume_id}")
async def get_resume(
    resume_id: str,
    accept_language: str = Header(default="en"),
):
    locale = accept_language.split(",")[0].split("-")[0]
    # Use locale for error messages
```

### Phase 4: LLM Output Localization (Week 4)

1. **Add language parameter** to improve endpoint
2. **Modify prompts** to specify output language
3. **Test output quality** in each language

```python
@router.post("/resumes/improve")
async def improve_resume(
    request: ImproveRequest,
    output_language: str = Query(default="en"),
):
    prompt = IMPROVE_RESUME_PROMPT.format(
        resume_json=resume_json,
        job_keywords=keywords,
        output_language=LANGUAGE_NAMES.get(output_language, "English"),
    )
```

### Phase 5: Testing & QA (Week 5)

1. **Visual testing** in each language
2. **Text overflow checks** (German is ~30% longer)
3. **RTL support** (if adding Arabic/Hebrew)
4. **PDF generation** in each language

---

## 7. Translation File Structure

### English (`messages/en.json`)

```json
{
  "dashboard": {
    "title": "Dashboard",
    "masterResume": {
      "title": "Master Resume",
      "initialize": "Initialize Master Resume",
      "processing": "Processing...",
      "ready": "Ready",
      "failed": "Failed"
    },
    "createResume": {
      "label": "Create Resume",
      "disabled": "Upload master resume first"
    }
  },
  "settings": {
    "title": "Settings",
    "status": {
      "title": "System Status",
      "llm": "LLM Status",
      "database": "Database Status"
    }
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "download": "Download",
    "loading": "Loading...",
    "error": "An error occurred"
  },
  "validation": {
    "required": "This field is required",
    "email": "Please enter a valid email",
    "minLength": "Minimum {min} characters required"
  }
}
```

### Spanish (`messages/es.json`)

```json
{
  "dashboard": {
    "title": "Panel de Control",
    "masterResume": {
      "title": "Currículum Principal",
      "initialize": "Inicializar Currículum Principal",
      "processing": "Procesando...",
      "ready": "Listo",
      "failed": "Fallido"
    },
    "createResume": {
      "label": "Crear Currículum",
      "disabled": "Primero sube tu currículum principal"
    }
  },
  "settings": {
    "title": "Configuración",
    "status": {
      "title": "Estado del Sistema",
      "llm": "Estado del LLM",
      "database": "Estado de la Base de Datos"
    }
  },
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Eliminar",
    "edit": "Editar",
    "download": "Descargar",
    "loading": "Cargando...",
    "error": "Ocurrió un error"
  }
}
```

### Backend (`locales/en.json`)

```json
{
  "errors": {
    "resume": {
      "notFound": "Resume not found",
      "processingFailed": "Failed to process resume",
      "uploadFailed": "Failed to upload resume"
    },
    "job": {
      "notFound": "Job description not found"
    },
    "config": {
      "invalidProvider": "Invalid LLM provider"
    }
  },
  "status": {
    "pending": "Pending",
    "processing": "Processing",
    "ready": "Ready",
    "failed": "Failed"
  }
}
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// Test translation key existence
describe("Translations", () => {
  const locales = ["en", "es", "fr"];
  const requiredKeys = [
    "dashboard.title",
    "settings.title",
    "common.save",
  ];

  locales.forEach((locale) => {
    it(`should have all required keys for ${locale}`, () => {
      const messages = require(`../messages/${locale}.json`);
      requiredKeys.forEach((key) => {
        expect(getNestedValue(messages, key)).toBeDefined();
      });
    });
  });
});
```

### 8.2 Visual Regression

```typescript
// Playwright visual comparison
const locales = ["en", "es", "fr", "de"];

locales.forEach((locale) => {
  test(`Dashboard renders correctly in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/dashboard`);
    await expect(page).toHaveScreenshot(`dashboard-${locale}.png`);
  });
});
```

### 8.3 Text Overflow Checks

```typescript
// Check for text overflow in buttons
test("Buttons should not overflow", async ({ page }) => {
  await page.goto("/de/dashboard"); // German is longest

  const buttons = await page.locator("button").all();
  for (const button of buttons) {
    const box = await button.boundingBox();
    const textContent = await button.textContent();
    expect(box.width).toBeGreaterThan(0);
    // Check text isn't clipped
    expect(await button.evaluate((el) =>
      el.scrollWidth <= el.clientWidth
    )).toBe(true);
  }
});
```

### 8.4 PDF Generation Tests

```python
# Test PDF generation in each language
@pytest.mark.parametrize("locale", ["en", "es", "fr", "de"])
async def test_pdf_generation(locale: str):
    response = await client.get(
        f"/api/v1/resumes/{resume_id}/pdf",
        params={"output_language": locale}
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
```

---

## String Count Summary

| Category | Count |
|----------|-------|
| Dashboard Page | 25 |
| Settings Page | 40 |
| Tailor Page | 20 |
| Resume Viewer | 20 |
| Resume Builder | 55 |
| Resume Form | 60 |
| UI Components | 15 |
| Validation | 10 |
| Common/Shared | 20 |
| **Frontend Total** | **~265** |
| Backend Errors | 20 |
| Backend Status | 10 |
| **Backend Total** | **~30** |
| **Grand Total** | **~295 strings** |

---

## File Changes Summary

### New Files to Create

| File | Purpose |
|------|---------|
| `apps/frontend/i18n.ts` | i18n configuration |
| `apps/frontend/middleware.ts` | Locale routing |
| `apps/frontend/messages/en.json` | English translations |
| `apps/frontend/messages/es.json` | Spanish translations |
| `apps/frontend/messages/fr.json` | French translations |
| `apps/frontend/messages/de.json` | German translations |
| `apps/backend/locales/en.json` | Backend English |
| `apps/backend/locales/es.json` | Backend Spanish |

### Files to Modify

| File | Changes |
|------|---------|
| `apps/frontend/app/layout.tsx` | Add NextIntlClientProvider |
| `apps/frontend/app/(default)/*/page.tsx` | Add useTranslations |
| `apps/frontend/components/**/*.tsx` | Extract hardcoded strings |
| `apps/backend/app/prompts/templates.py` | Add language parameter |
| `apps/backend/app/routers/*.py` | Add locale support |

---

## Notes for Translators

1. **Preserve placeholders**: `{count}`, `{name}`, etc. must remain in translations
2. **Match formatting**: If English uses Title Case, maintain similar conventions
3. **Context matters**: "Resume" in UI vs "Resume" in API may need different translations
4. **Test lengths**: German/French strings are typically 20-30% longer than English
5. **Professional tone**: All text should maintain formal, professional language
