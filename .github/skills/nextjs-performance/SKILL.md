---
name: nextjs-performance
description: |
  Next.js critical performance fixes. Prevents async waterfalls, reduces bundle size, secures Server Actions, and ensures correct production builds. Use when writing React components, data fetching, Server Actions, or optimizing bundle size.
---

# Next.js Performance

## Before Writing Code

1. Read `docs/agent/architecture/nextjs-critical-fixes.md` for full patterns
2. Check existing components in `apps/frontend/components/`

## Critical Rules

### Waterfalls

- Use `Promise.all()` for independent fetches
- Wrap slow data in `<Suspense>` boundaries
- Defer `await` into branches where needed

```tsx
// WRONG
const resumes = await fetchResumes();
const jobs = await fetchJobs();

// RIGHT
const [resumes, jobs] = await Promise.all([fetchResumes(), fetchJobs()]);
```

### Bundle Size

- **NO barrel imports**: `import X from 'lucide-react'` is WRONG
- **YES direct imports**: `import X from 'lucide-react/dist/esm/icons/x'`
- Use `next/dynamic` for heavy components (editors, charts, PDF)
- Defer analytics with `ssr: false`

```tsx
import dynamic from 'next/dynamic';
const HeavyEditor = dynamic(() => import('./HeavyEditor'), { ssr: false });
```

### Server Actions

- **ALWAYS** check auth INSIDE the action, not just middleware
- Verify resource ownership before mutations

### Production Build

- Run `npm run build && npm run start`, NOT `npm run dev`
- Docker must use standalone output

## Pre-PR Checklist

```
[ ] No sequential awaits for independent data
[ ] Icons imported directly (not barrel)
[ ] Heavy components use next/dynamic
[ ] Server Actions have auth inside
[ ] Suspense around slow fetches
```
