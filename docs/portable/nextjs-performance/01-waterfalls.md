# Eliminating Waterfalls (CRITICAL)

> Sibling docs: [bundle size](02-bundle-size.md) · [server actions security](03-server-actions-security.md) · [server-side perf](04-server-side-perf.md) · [checklist](checklist.md)

---

## What's a waterfall?

A waterfall is a sequence of `await`s where each one blocks the next, even though they could run in parallel. Each sequential `await` adds the **full network latency** of the slowest dependency before anything else can start.

Waterfalls are the #1 performance killer in App Router code, and they're nearly invisible until you profile.

```text
Sequential (waterfall):    [user 200ms][posts 200ms][comments 200ms]  →  600ms
Parallel:                  [user 200ms]                               →  200ms
                           [posts 200ms]
                           [comments 200ms]
```

---

## 1.1 Parallel fetching with `Promise.all()`

The single most common waterfall: independent data fetches stacked sequentially.

```tsx
// ❌ BAD: Sequential — 600ms total
async function getPageData() {
  const user = await fetchUser();
  const posts = await fetchPosts();
  const comments = await fetchComments();
  return { user, posts, comments };
}

// ✅ GOOD: Parallel — 200ms total
async function getPageData() {
  const [user, posts, comments] = await Promise.all([
    fetchUser(),
    fetchPosts(),
    fetchComments(),
  ]);
  return { user, posts, comments };
}
```

**Rule of thumb**: if two `await`s don't depend on each other's results, they should be inside a single `Promise.all()`.

### Dependent fetches

When fetch B genuinely needs the result of fetch A, you can't parallelize them — but you can still start fetch C in parallel with A.

```tsx
// ✅ GOOD: A and C run in parallel; B waits on A
const userPromise = fetchUser(userId);
const settingsPromise = fetchSettings();        // independent — start it now

const user = await userPromise;
const posts = await fetchUserPosts(user.id);    // depends on user
const settings = await settingsPromise;
```

---

## 1.2 Defer `await` to where it's actually needed

Don't await things you might not use.

```tsx
// ❌ BAD: Always waits for analytics, even when validation fails
async function handleSubmit(data: FormData) {
  const analytics = await getAnalytics();

  if (!data.get('email')) {
    return { error: 'Email required' };
  }

  analytics.track('submit');
}

// ✅ GOOD: Validate first, only await analytics on the success path
async function handleSubmit(data: FormData) {
  if (!data.get('email')) {
    return { error: 'Email required' };
  }

  const analytics = await getAnalytics();
  analytics.track('submit');
}
```

**Rule of thumb**: cheap synchronous checks (validation, auth) come before expensive async work.

---

## 1.3 Start promises early, await late

If you can't parallelize but still know in advance what you'll need, kick off the fetch as early as possible and only await right before you use it.

```tsx
// ❌ BAD: 200ms wasted between body parse and user fetch
export async function POST(req: Request) {
  const body = await req.json();                            // 50ms
  const user = await getUser(body.userId);                  // 100ms (waits for body)
  const permissions = await getPermissions(user.id);        // 100ms (waits for user)
  return Response.json({ user, permissions });
}

// ✅ GOOD: Chain promises immediately, await all at once
export async function POST(req: Request) {
  const body = await req.json();

  // Start both immediately — permissions chains off user without blocking
  const userPromise = getUser(body.userId);
  const permissionsPromise = userPromise.then(u => getPermissions(u.id));

  const [user, permissions] = await Promise.all([userPromise, permissionsPromise]);
  return Response.json({ user, permissions });
}
```

This pattern (start early, await late) is the second-most-common waterfall fix after `Promise.all`.

---

## 1.4 Use Suspense boundaries for streaming

If part of your page is fast and part is slow, don't make the fast part wait. Stream the slow part in with `<Suspense>`.

```tsx
// ❌ BAD: Whole page waits for the slow analysis fetch
export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await getProduct(params.id);          // 50ms — fast
  const reviews = await getReviews(params.id);          // 500ms — slow

  return (
    <div>
      <ProductDetails product={product} />
      <ReviewsList reviews={reviews} />
    </div>
  );
}

// ✅ GOOD: Render product immediately, stream reviews in
import { Suspense } from 'react';

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await getProduct(params.id);

  return (
    <div>
      <ProductDetails product={product} />
      <Suspense fallback={<ReviewsSkeleton />}>
        <ReviewsPanel productId={params.id} />
      </Suspense>
    </div>
  );
}

// Slow data lives in its own async component
async function ReviewsPanel({ productId }: { productId: string }) {
  const reviews = await getReviews(productId);
  return <ReviewsList reviews={reviews} />;
}
```

The user sees the product immediately. The reviews stream in when ready. Time-to-first-byte and time-to-interactive both improve dramatically.

---

## When to apply

- **Always** when fetching multiple independent resources
- **Always** when one fetch is significantly slower than another and the user can act on the fast one
- **Whenever** you spot a function with two consecutive `await`s — pause and ask "do these depend on each other?"

Next: [02-bundle-size.md](02-bundle-size.md) covers the second-biggest source of waste — JS bundles full of unused code.
