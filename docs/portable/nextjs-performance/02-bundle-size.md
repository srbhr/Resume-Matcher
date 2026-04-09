# Bundle Size Optimization (CRITICAL)

> Sibling docs: [waterfalls](01-waterfalls.md) · [server actions security](03-server-actions-security.md) · [server-side perf](04-server-side-perf.md) · [checklist](checklist.md)

---

## Why bundles bloat silently

Modern JS libraries ship as **barrel files** — single index.js entry points that re-export everything. When you `import { Foo } from 'big-lib'`, the bundler often pulls in the *entire* library, even though you only use one symbol. This adds 200–800ms to cold starts and balloons your client bundle.

The fixes are simple, mechanical, and high-impact.

---

## 2.1 Avoid barrel imports

The single most expensive line of code in many projects is a one-line icon import.

```tsx
// ❌ BAD: Loads ~1,583 modules from lucide-react
import { FileText, Upload, Check } from 'lucide-react';

// ✅ GOOD: Direct deep imports — loads only 3 modules
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Upload from 'lucide-react/dist/esm/icons/upload';
import Check from 'lucide-react/dist/esm/icons/check';
```

The deep-import path is library-specific. For lucide-react it's `lucide-react/dist/esm/icons/<kebab-name>`. Check your library's source for the actual path.

### Or: use `optimizePackageImports`

Next.js 15 has a built-in fix that does the deep-import rewrite at build time:

```js
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'date-fns',
      'lodash',
    ],
  },
};
```

This is the lower-effort path. Use it if you can — fall back to manual deep imports only for libraries Next.js doesn't recognize.

### Commonly affected libraries

- `lucide-react`
- `@radix-ui/react-*`
- `react-icons`
- `date-fns`
- `lodash` (use `lodash-es` or per-method imports)
- `@mui/material`
- `@chakra-ui/react`

If you're importing from any of these, audit it.

---

## 2.2 Dynamic imports for heavy components

Some components are huge (editors, charts, video players, PDF renderers) and only used in specific flows. Don't ship them on the initial page load.

```tsx
// ❌ BAD: Monaco editor loads on every page (2MB+)
import { MonacoEditor } from '@/components/monaco-editor';

export default function EditorPage() {
  const [showEditor, setShowEditor] = useState(false);
  return showEditor ? <MonacoEditor /> : <Preview />;
}

// ✅ GOOD: Load Monaco only when the user actually needs it
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(
  () => import('@/components/monaco-editor'),
  {
    loading: () => <EditorSkeleton />,
    ssr: false,
  }
);
```

### When to use `ssr: false`

- The component touches `window`, `document`, or other browser-only APIs
- The component is purely interactive (no SEO value in pre-rendering it)
- The component is gated behind a button click or modal

When in doubt: if it's a click-to-open editor or modal, set `ssr: false`.

### Heavy candidates worth checking

- Code editors (Monaco, CodeMirror, Ace)
- Rich text editors (TipTap, Quill, Slate)
- Charts (Recharts, Chart.js, D3)
- PDF viewers / editors
- Video players
- 3D libraries (Three.js, Babylon)
- Markdown editors with preview

---

## 2.3 Defer third-party scripts

Analytics, error tracking, A/B testing — none of these need to block hydration.

```tsx
// ❌ BAD: Analytics blocks hydration
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

// ✅ GOOD: Lazy-load after hydration
import dynamic from 'next/dynamic';

const Analytics = dynamic(
  () => import('@vercel/analytics/react').then(m => m.Analytics),
  { ssr: false }
);
```

### Or: use `next/script` with the right strategy

```tsx
import Script from 'next/script';

<Script
  src="https://example.com/analytics.js"
  strategy="lazyOnload"  // or "afterInteractive"
/>
```

| Strategy | When it loads | Use for |
|----------|---------------|---------|
| `beforeInteractive` | Before page is interactive | Polyfills only — almost never |
| `afterInteractive` | Right after hydration | Tag managers, A/B test SDKs |
| `lazyOnload` | During browser idle time | Analytics, chat widgets, social embeds |
| `worker` (experimental) | In a web worker | Heavy tracking scripts |

**Default**: `lazyOnload` for anything that doesn't need to fire before user interaction.

---

## How to measure

You don't have to guess what's bloated. Two free tools:

```bash
# Analyze your build output
ANALYZE=true next build

# Or for a quick check
next build  # look at the "First Load JS" column
```

If any route shows >300KB First Load JS, you almost certainly have a barrel import or a heavy component that should be dynamic.

---

## When to apply

- **Always** for icon libraries — there is never a reason to barrel-import 1,500 icons to use 3
- **Always** for analytics, error tracking, chat widgets, social embed scripts
- **When a route exceeds ~250KB First Load JS** — start hunting for heavy components to lazy-load

Next: [03-server-actions-security.md](03-server-actions-security.md) covers a smaller but critical category — auth boundaries inside Server Actions.
