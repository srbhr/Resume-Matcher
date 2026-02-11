---
name: nextjs15-performance
description: Next.js 15 critical performance fixes. Use when writing React components, data fetching, Server Actions, or optimizing bundle size.
---

## Before writing Next.js code

1. Read `docs/agent/architecture/nextjs-critical-fixes.md` for full patterns
2. Check existing components in `apps/frontend/components/` for examples

## Critical Rules (always apply)

### Waterfalls

- Use `Promise.all()` for independent fetches
- Wrap slow data in `<Suspense>` boundaries
- Defer `await` into branches where needed

### Bundle Size

- NO barrel imports: `import X from 'lucide-react'` ❌
- YES direct imports: `import X from 'lucide-react/dist/esm/icons/x'` ✅
- Use `next/dynamic` for heavy components (editors, charts, PDF viewers)
- Defer analytics with `ssr: false`

### Server Actions

- ALWAYS check auth INSIDE the action, not just middleware
- Verify resource ownership before mutations

### Production Build

- Users run `npm run build && npm run start`, NOT `npm run dev`
- Docker must use standalone output, not dev mode

## Quick Check Before PR

```
[ ] No sequential awaits for independent data
[ ] Icons imported directly
[ ] Heavy components use next/dynamic
[ ] Server Actions have auth inside
[ ] Suspense around slow fetches
```
