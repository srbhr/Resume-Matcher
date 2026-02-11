---
name: react-patterns
description: |
  React and Next.js performance optimization guidelines from Vercel Engineering, tuned for local/offline or Docker-deployed apps. Eliminates async waterfalls, reduces bundle size, optimizes server and client performance.
---

# React Performance Patterns (Local/Docker)

From Vercel Engineering, optimized for local installs and Docker deployments.

## Priority Categories

| Priority | Category | Impact | Key Pattern |
|----------|----------|--------|-------------|
| 1 | Eliminating Waterfalls | CRITICAL | `Promise.all()`, Suspense |
| 2 | Bundle Size | CRITICAL | Direct imports, `next/dynamic` |
| 3 | Server-Side Performance | HIGH | `React.cache`, LRU caching |
| 4 | Client-Side Data | MEDIUM-HIGH | SWR dedup |
| 5 | Re-render Optimization | MEDIUM | Memoized subtrees, transitions |
| 6 | Rendering Performance | MEDIUM | `content-visibility` |

## Critical Patterns

### Eliminate Waterfalls (Priority 1)

```tsx
// WRONG - sequential
const data1 = await fetchA();
const data2 = await fetchB();

// RIGHT - parallel
const [data1, data2] = await Promise.all([fetchA(), fetchB()]);

// RIGHT - stream slow data
<Suspense fallback={<Skeleton />}>
  <SlowComponent />
</Suspense>
```

### Reduce Bundle Size (Priority 2)

```tsx
// WRONG - barrel import (pulls entire library)
import { FileText } from 'lucide-react';

// RIGHT - direct import
import FileText from 'lucide-react/dist/esm/icons/file-text';

// RIGHT - dynamic import for heavy components
import dynamic from 'next/dynamic';
const PDFViewer = dynamic(() => import('./PDFViewer'), { ssr: false });
```

### Server Caching (Priority 3)

```tsx
import { cache } from 'react';
const getData = cache(async (id: string) => await db.get(id));
```

## Local/Docker Focus

- Optimize for cold-start and steady-state responsiveness over SEO
- Use in-process caches (server process persists)
- Avoid sequential awaits even for local APIs
- Defer non-critical work until after render
- Minimize RSC props to reduce hydration overhead

## Full Reference

Complete guide: `.claude/skills/react-patterns/SKILL.md`
Condensed guide: `.claude/skills/react-patterns/REACT_PATTERNS.md`
