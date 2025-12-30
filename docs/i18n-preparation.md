# Internationalization (i18n)

This document details the multi-language support in Resume Matcher.

---

## Overview

Resume Matcher supports:
1. **UI Translations** - Interface text (buttons, labels, navigation) in multiple languages
2. **Content Generation Language** - Generated content (resumes, cover letters) in user's chosen language

Users configure both settings independently in the Settings page.

---

## Supported Languages

| Code | Language | Native Name |
|------|----------|-------------|
| `en` | English | English |
| `es` | Spanish | Español |
| `zh` | Chinese (Simplified) | 中文 |
| `ja` | Japanese | 日本語 |

---

## How It Works

### What Gets Affected

| Content Type | UI Language | Content Language |
|--------------|-------------|------------------|
| Navigation & buttons | ✅ Translated | - |
| Form labels & descriptions | ✅ Translated | - |
| Error messages | ✅ Translated | - |
| **NEW** tailored resumes | - | ✅ Generated in selected language |
| **NEW** cover letters | - | ✅ Generated in selected language |
| **NEW** outreach messages | - | ✅ Generated in selected language |
| **Existing** resumes in DB | - | ❌ Remain in original language |

### Data Flow

```
Settings Page (Content Language selector)
         ↓
LanguageProvider (React Context)
         ↓
localStorage cache + Backend API
         ↓
Backend reads content_language from config.json
         ↓
LLM prompts include {output_language} placeholder
         ↓
Generated content in selected language
```

---

## Frontend Implementation

### File Structure

```
apps/frontend/
├── i18n/
│   └── config.ts              # Locale codes and display names
├── messages/
│   ├── en.json                # English translations
│   ├── es.json                # Spanish translations
│   ├── zh.json                # Chinese translations
│   └── ja.json                # Japanese translations
├── lib/
│   ├── api/
│   │   └── config.ts          # Language API functions
│   ├── context/
│   │   └── language-context.tsx   # LanguageProvider (UI + content language)
│   └── i18n/
│       ├── index.ts           # i18n exports
│       └── translations.ts    # useTranslations hook
└── app/(default)/
    └── settings/page.tsx      # Language selectors (UI + content)
```

### LanguageProvider Context

```typescript
interface LanguageContextValue {
  contentLanguage: SupportedLanguage;  // For LLM-generated content
  uiLanguage: Locale;                   // For UI translations
  isLoading: boolean;
  setContentLanguage: (lang: SupportedLanguage) => Promise<void>;
  setUiLanguage: (lang: Locale) => void;
  languageNames: Record<Locale, string>;
  supportedLanguages: readonly Locale[];
}
```

### Usage

```typescript
// Get language settings
const { contentLanguage, uiLanguage, setContentLanguage, setUiLanguage } = useLanguage();

// Use translations
import { useTranslations } from '@/lib/i18n';
const { t } = useTranslations();

// In components:
<button>{t('common.save')}</button>
<h1>{t('dashboard.title')}</h1>
```

---

## Backend Implementation

### File Structure

```
apps/backend/app/
├── routers/
│   └── config.py              # Language endpoints
├── prompts/
│   └── templates.py           # LANGUAGE_NAMES, {output_language}
└── services/
    ├── improver.py            # improve_resume(language=...)
    └── cover_letter.py        # generate_cover_letter(language=...)
```

### API Endpoints

#### GET /api/v1/config/language

```json
{
  "ui_language": "en",
  "content_language": "es",
  "supported_languages": ["en", "es", "zh", "ja"]
}
```

#### PUT /api/v1/config/language

```json
{
  "content_language": "ja"
}
```

### Prompt Integration

```python
# templates.py
LANGUAGE_NAMES = {
    "en": "English",
    "es": "Spanish",
    "zh": "Chinese (Simplified)",
    "ja": "Japanese",
}

IMPROVE_RESUME_PROMPT = """...
IMPORTANT: Generate ALL text content in {output_language}.
..."""
```

### Service Functions

```python
# improver.py
async def improve_resume(..., language: str = "en"):
    output_language = get_language_name(language)
    prompt = IMPROVE_RESUME_PROMPT.format(..., output_language=output_language)

# cover_letter.py
async def generate_cover_letter(..., language: str = "en"):
async def generate_outreach_message(..., language: str = "en"):
```

---

## Adding a New Language

### Step 1: Frontend Config

Edit `apps/frontend/i18n/config.ts`:

```typescript
export const locales = ['en', 'es', 'zh', 'ja', 'fr'] as const;

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  zh: '中文',
  ja: '日本語',
  fr: 'Français',
};
```

### Step 2: Backend Language Names

Edit `apps/backend/app/prompts/templates.py`:

```python
LANGUAGE_NAMES = {
    "en": "English",
    "es": "Spanish",
    "zh": "Chinese (Simplified)",
    "ja": "Japanese",
    "fr": "French",
}
```

### Step 3: Backend Supported Languages

Edit `apps/backend/app/routers/config.py`:

```python
SUPPORTED_LANGUAGES = ["en", "es", "zh", "ja", "fr"]
```

---

## Storage

### localStorage Keys

| Key | Purpose |
|-----|---------|
| `resume_matcher_ui_language` | UI language preference (client-side only) |
| `resume_matcher_content_language` | Content generation language (synced with backend) |

### Backend Config

Content language is stored in `apps/backend/data/config.json`:

```json
{
  "content_language": "en",
  ...
}
```

**Note:** UI language is client-side only and not synced to backend.

---

## UI Translations

UI translations are implemented using a simple JSON-based approach without external dependencies.

### Message Files

Messages are stored in `messages/{locale}.json`:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete"
  },
  "nav": {
    "dashboard": "Dashboard",
    "builder": "Resume Builder",
    "settings": "Settings"
  },
  "dashboard": {
    "title": "Dashboard",
    "myResumes": "My Resumes"
  }
}
```

### Using Translations

```typescript
import { useTranslations } from '@/lib/i18n';

function MyComponent() {
  const { t } = useTranslations();

  return (
    <div>
      <h1>{t('dashboard.title')}</h1>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

### Adding Translations to Components

1. Import `useTranslations` from `@/lib/i18n`
2. Call `const { t } = useTranslations()` in your component
3. Replace hardcoded strings with `t('key.path')` calls
4. Add corresponding keys to all locale JSON files

### Storage

- UI language: `localStorage` key `resume_matcher_ui_language`
- Content language: `localStorage` + backend `data/config.json`
