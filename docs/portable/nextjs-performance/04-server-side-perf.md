# Server-Side Performance (HIGH)

> Sibling docs: [waterfalls](01-waterfalls.md) · [bundle size](02-bundle-size.md) · [server actions security](03-server-actions-security.md) · [checklist](checklist.md)

---

## Scope

Once you've fixed waterfalls (file 01) and bundle bloat (file 02), the next tier of wins comes from three patterns: deduplicating server-side data fetches, trimming what you send to the client, and pushing non-critical work off the response path.

These are HIGH severity, not CRITICAL — they matter, but the gains are smaller and require more refactoring than the earlier fixes.

---

## 4.1 Use `React.cache()` for request deduplication

In App Router, the same data-fetching function can be called from multiple places during a single request — `layout.tsx`, `page.tsx`, nested components, metadata generation. Without dedup, each call hits your database again.

```tsx
// ❌ BAD: Same user fetched 3+ times per request
// layout.tsx
const user = await getUser(userId);

// page.tsx
const user = await getUser(userId);  // duplicate query

// generateMetadata()
const user = await getUser(userId);  // another duplicate
```

```tsx
// ✅ GOOD: One fetch per request, shared everywhere
// lib/data.ts
import { cache } from 'react';

export const getUser = cache(async (userId: string) => {
  return await db.user.findUnique({ where: { id: userId } });
});
```

`cache()` creates a per-request memoization layer. The first call hits the database; subsequent calls (within the same request) return the cached result. The cache resets between requests, so you don't have to worry about stale data.

### When to apply

- Any data-fetcher called from more than one place during a single request
- Especially: user lookups, current-tenant lookups, feature flag fetches, permission checks
- Wrap them at the source (in `lib/data.ts`), not at every call site

### What `cache()` is NOT

- Not a cross-request cache — use `unstable_cache` or external caching for that
- Not a client-side cache — only works in Server Components
- Not magic — if your fetcher takes different arguments at each call site, it won't dedup

---

## 4.2 Minimize client component data

When you pass props from a Server Component into a Client Component, those props get **serialized into the HTML** and shipped to the browser. Sending the entire user object means shipping the user's email, password hash (if present), internal IDs, etc. — every page load.

```tsx
// ❌ BAD: Sends the whole user object to the browser
const user = await getUser(id);
return <ClientProfile user={user} />;

// What gets serialized: { id, name, email, passwordHash, role, internalNotes, ... }
```

```tsx
// ✅ GOOD: Pick only the fields the client genuinely needs
const user = await getUser(id);
return (
  <ClientProfile
    user={{
      name: user.name,
      avatar: user.avatar,
    }}
  />
);
```

This has two benefits:

1. **Smaller HTML payload** — faster time-to-first-byte
2. **Less leakage** — sensitive fields never reach the browser, even if the client component never renders them

### Rule of thumb

Treat the Server→Client boundary as a public API. Pick fields explicitly. Never pass full ORM objects.

---

## 4.3 Use `after()` for non-blocking work

Some work has to happen as a result of a request, but the user doesn't need to wait for it: analytics tracking, webhook fanout, audit logs, cache warming, email queuing.

In Next.js 15, the `after()` API lets you defer this work until **after the response has been sent**.

```tsx
// ❌ BAD: User waits for analytics + webhook before getting their response
export async function POST(req: Request) {
  const data = await processRequest(req);
  await logToAnalytics(data);  // user waits
  await sendWebhook(data);     // user waits
  return Response.json(data);
}
```

```tsx
// ✅ GOOD: Respond first, do background work after
import { after } from 'next/server';

export async function POST(req: Request) {
  const data = await processRequest(req);

  after(async () => {
    await logToAnalytics(data);
    await sendWebhook(data);
  });

  return Response.json(data);  // returns immediately
}
```

The user sees the response in N ms instead of N + analytics_latency + webhook_latency ms.

### What's safe to put in `after()`

- ✅ Analytics events
- ✅ Audit logging
- ✅ Cache warming / invalidation
- ✅ Webhook dispatch (fire-and-forget)
- ✅ Email queueing (queueing, not sending)

### What's NOT safe to put in `after()`

- ❌ Anything the response payload depends on
- ❌ Anything the user expects to be durable before they see success (e.g., the actual database write)
- ❌ Anything that needs to fail loudly to the user

If a failure in `after()` should block the user, it doesn't belong there.

### `after()` and Server Actions

`after()` works in Server Actions too:

```tsx
'use server';

import { after } from 'next/server';

export async function createPost(formData: FormData) {
  const post = await db.post.create({ data: { /* ... */ } });

  after(async () => {
    await indexInSearch(post);
    await notifySubscribers(post);
  });

  return { id: post.id };
}
```

---

## When to apply

| Pattern | When |
|---------|------|
| `cache()` | Any data fetcher called from multiple places per request |
| Minimize client props | Always — make picking fields a habit |
| `after()` | Any post-response work that doesn't gate user feedback |

These are not as urgent as fixing waterfalls and barrels, but they compound. Apply them once and they keep paying off as the codebase grows.

Next: [checklist.md](checklist.md) — a pre-merge checklist plus a `next.config.js` template.
