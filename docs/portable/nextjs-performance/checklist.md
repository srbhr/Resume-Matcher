# Pre-PR Checklist & Config Template

> Sibling docs: [waterfalls](01-waterfalls.md) · [bundle size](02-bundle-size.md) · [server actions security](03-server-actions-security.md) · [server-side perf](04-server-side-perf.md)

---

## Pre-merge checklist

Walk through this before opening or merging any PR that touches Next.js application code.

### Data fetching ([01-waterfalls.md](01-waterfalls.md))

- [ ] No two consecutive `await`s on independent data — wrap them in `Promise.all()`
- [ ] Validation/auth checks happen *before* expensive async work
- [ ] Slow data is wrapped in `<Suspense>` so the rest of the page can render
- [ ] Independent fetches in API routes start as early as possible

### Bundle size ([02-bundle-size.md](02-bundle-size.md))

- [ ] No barrel imports from icon libraries (`lucide-react`, `@radix-ui/react-icons`, etc.) without `optimizePackageImports`
- [ ] Heavy components (editors, charts, PDF, video, 3D) use `next/dynamic`
- [ ] `ssr: false` on dynamic components that touch `window` or are gated behind interaction
- [ ] Analytics, chat widgets, and tracking scripts use `next/script` with `lazyOnload`, or are dynamically imported
- [ ] First Load JS for new routes is under ~250KB

### Server Actions ([03-server-actions-security.md](03-server-actions-security.md))

- [ ] Every Server Action calls `auth()` (or equivalent) at the top
- [ ] Every action that takes a resource ID also verifies **ownership** of that resource
- [ ] Input is validated with a schema (Zod, Valibot, etc.) — never trust the shape
- [ ] Errors are thrown, not silently logged

### Server-side performance ([04-server-side-perf.md](04-server-side-perf.md))

- [ ] Multi-call data fetchers (`getCurrentUser`, `getCurrentTenant`, etc.) are wrapped in `React.cache()`
- [ ] Server→Client component props are explicit picks, not full ORM objects
- [ ] Analytics, webhooks, and audit logs use `after()` instead of blocking the response

### Quick sanity pass

- [ ] `next build` succeeds with no warnings about large bundles
- [ ] No `console.log` left in production code paths
- [ ] No `'use client'` at the top of files that don't need it (Server Components are the default for a reason)

---

## `next.config.js` template

A baseline config that turns on the most important optimizations for Next.js 15. Drop this in and adjust the package list to match your dependencies.

```js
/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    // Tree-shake barrel imports automatically
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      '@radix-ui/react-*',
      'date-fns',
      'lodash-es',
    ],
  },

  // If you serve images, prefer modern formats
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Strict mode catches a lot of subtle bugs
  reactStrictMode: true,
};
```

### What this turns on

| Setting | Effect |
|---------|--------|
| `optimizePackageImports` | Per-symbol tree-shaking for the listed libraries — typically saves 200–800ms cold start |
| `images.formats` | Serves AVIF/WebP when the browser supports it — typically 30–60% smaller than JPEG |
| `reactStrictMode` | Surfaces unsafe lifecycles, double-renders effects in dev to catch bugs |

---

## When the checklist starts feeling automatic

Once you've gone through it on a dozen PRs, the patterns become reflexive. At that point:

- Add a CI check for First Load JS budgets per route
- Add an ESLint rule (or custom regex check) for barrel imports from your most-abused libraries
- Add a code-review template that includes the auth-and-ownership verification step for Server Actions

The goal is to make these checks happen automatically so you can focus on the next tier of optimizations.
