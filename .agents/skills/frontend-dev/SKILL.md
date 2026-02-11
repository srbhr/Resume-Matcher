---
name: frontend-dev
description: |
  Frontend development agent for Resume Matcher. Handles Next.js pages, React components, Tailwind CSS with Swiss International Style, API integration, hooks, and i18n. Use when creating or modifying frontend code.
metadata:
  author: resume-matcher
  version: "1.0.0"
allowed-tools: Bash(npm:*) Bash(npx:*) Read
---

# Frontend Development Agent

> Use when creating or modifying Next.js pages, React components, Tailwind CSS styles, API integration, hooks, or i18n.

## Before Writing Code

1. Read `docs/agent/architecture/frontend-workflow.md` for user flow
2. Read `docs/agent/design/style-guide.md` for Swiss International Style (**REQUIRED**)
3. Read `docs/agent/coding-standards.md` for conventions
4. Check existing components in `apps/frontend/components/` for patterns

## Non-Negotiable Rules

1. **Swiss International Style** - ALL UI changes must follow it
2. **`rounded-none`** everywhere - no rounded corners, ever
3. **Hard shadows** - `shadow-[4px_4px_0px_0px_#000000]`, never soft shadows
4. **Run `npm run lint`** before committing
5. **Run `npm run format`** before committing
6. **Enter key handling** on all textareas

## Project Structure

```
apps/frontend/
├── app/                 # Next.js pages
│   ├── dashboard/       # Main dashboard
│   ├── builder/         # Resume builder
│   ├── tailor/          # AI tailoring
│   ├── print/           # PDF print view
│   └── settings/        # User settings
├── components/          # Reusable UI components
├── lib/                 # API client, utilities, i18n
├── hooks/               # Custom React hooks
└── messages/            # i18n translations (en, es, zh, ja)
```

## Swiss International Style Quick Reference

| Element | Value |
|---------|-------|
| Canvas bg | `#F0F0E8` / `bg-[#F0F0E8]` |
| Ink text | `#000000` |
| Hyper Blue | `#1D4ED8` / `text-blue-700` |
| Signal Green | `#15803D` / `text-green-700` |
| Alert Red | `#DC2626` / `text-red-600` |
| Headers | `font-serif` |
| Body | `font-sans` |
| Labels | `font-mono text-sm uppercase tracking-wider` |
| Borders | `rounded-none border-2 border-black` |
| Shadows | `shadow-[4px_4px_0px_0px_#000000]` |
| Hover | `hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none` |

### Anti-Patterns (NEVER use)

- `rounded-*` (except `rounded-none`)
- Gradients or blur shadows
- Colors outside the palette
- Pastel or soft colors
- Decorative icons without function

## Patterns

### New Component

```tsx
'use client';

interface MyComponentProps {
  title: string;
  onAction: () => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  return (
    <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-6">
      <h3 className="font-serif text-xl mb-4">{title}</h3>
      <button
        onClick={onAction}
        className="rounded-none border-2 border-black px-4 py-2 bg-blue-700 text-white shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
      >
        Action
      </button>
    </div>
  );
}
```

### Textarea (Enter key fix)

```tsx
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter') e.stopPropagation();
};

<textarea
  onKeyDown={handleKeyDown}
  className="w-full rounded-none border-2 border-black p-3 font-sans"
/>
```

### Bundle Optimization

```tsx
// Direct icon import (NOT barrel import)
import FileText from 'lucide-react/dist/esm/icons/file-text';

// Dynamic import for heavy components
import dynamic from 'next/dynamic';
const PDFViewer = dynamic(() => import('./PDFViewer'), { ssr: false });
```

### API Integration

```tsx
import { api } from '@/lib/api';

async function loadResumes() {
  // Use Promise.all for independent fetches
  const [resumes, jobs] = await Promise.all([
    api.get('/api/v1/resumes'),
    api.get('/api/v1/jobs'),
  ]);
  return { resumes, jobs };
}
```

### i18n

```tsx
import { useTranslations } from '@/lib/i18n';

export function MyComponent() {
  const { t } = useTranslations();
  return <h1>{t('dashboard.title')}</h1>;
}
```

## Checklist Before Committing

- [ ] `npm run lint` passes
- [ ] `npm run format` run
- [ ] `rounded-none` on all elements
- [ ] Hard shadows (no soft shadows)
- [ ] Swiss color palette only
- [ ] Correct typography (serif headers, mono labels, sans body)
- [ ] Textareas have Enter key handler
- [ ] Icons imported directly (not barrel)
- [ ] Heavy components use `next/dynamic`
- [ ] Independent fetches use `Promise.all()`
