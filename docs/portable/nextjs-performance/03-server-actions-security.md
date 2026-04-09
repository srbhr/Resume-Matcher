# Server Actions Security (CRITICAL)

> Sibling docs: [waterfalls](01-waterfalls.md) · [bundle size](02-bundle-size.md) · [server-side perf](04-server-side-perf.md) · [checklist](checklist.md)

---

## The core fact

**Server Actions are public HTTP endpoints.** Even though they're called like functions from your client components, Next.js exposes them as POST routes that anyone with a fetch client can hit directly.

This means: **never trust the call site**. The fact that "the button is only shown to admins" does not protect the action. An attacker can call the action with any payload they want, regardless of UI state.

Every Server Action must verify auth and authorization **inside the action body**.

---

## The vulnerable pattern

```tsx
// ❌ BAD: No auth check — anyone can delete any record
'use server';

export async function deleteResource(resourceId: string) {
  await db.resource.delete({ where: { id: resourceId } });
  return { success: true };
}
```

This looks safe at a glance. The button that calls it might only be shown to logged-in users. But the action itself accepts a bare `resourceId` from anyone. An attacker can:

1. Open the network tab, find the action endpoint
2. Call it with `resourceId: "any-id-they-want"`
3. Delete records they don't own

There is no client-side guard you can add that fixes this.

---

## The safe pattern

```tsx
// ✅ GOOD: Verify auth, then ownership, then act
'use server';

import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function deleteResource(resourceId: string) {
  // 1. Authentication — is anyone logged in?
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  // 2. Authorization — does this user own this resource?
  const resource = await db.resource.findUnique({ where: { id: resourceId } });
  if (!resource || resource.userId !== session.user.id) {
    throw new Error('Forbidden');
  }

  // 3. Now it's safe to perform the action
  await db.resource.delete({ where: { id: resourceId } });
  revalidatePath('/dashboard');
  return { success: true };
}
```

The order matters: **authenticate, then authorize, then act**.

---

## Three layers of checks

| Layer | Question | Failure response |
|-------|----------|------------------|
| **Authentication** | Is there a logged-in user at all? | `Unauthorized` (401-equivalent) |
| **Authorization** | Does this user have permission to act on this resource? | `Forbidden` (403-equivalent) |
| **Validation** | Is the input shape and value sane? | `Invalid input` (400-equivalent) |

Skipping any layer is a security hole. The most common mistake is checking auth but skipping authorization — "logged in" is not the same as "allowed to touch this record".

---

## Validating input

Server Actions accept whatever you pass them. Use a schema validator (Zod, Valibot, etc.) at the top of every action that takes structured input.

```tsx
'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500),
});

export async function updateProfile(input: unknown) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  // Validate before touching the DB
  const data = UpdateProfileSchema.parse(input);

  await db.user.update({
    where: { id: session.user.id },
    data,
  });
}
```

Without validation, an attacker could pass `{ name: <huge string>, role: 'admin' }` and your DB write might silently overwrite fields you didn't intend to expose.

---

## A reusable wrapper

If you have many actions that all need the same checks, factor them into a higher-order helper:

```tsx
// lib/action.ts
import { auth } from '@/lib/auth';

export function authedAction<TInput, TOutput>(
  fn: (input: TInput, userId: string) => Promise<TOutput>
) {
  return async (input: TInput): Promise<TOutput> => {
    const session = await auth();
    if (!session?.user) throw new Error('Unauthorized');
    return fn(input, session.user.id);
  };
}
```

Then your actions become:

```tsx
'use server';

import { authedAction } from '@/lib/action';

export const deleteResource = authedAction(async (resourceId: string, userId) => {
  const resource = await db.resource.findUnique({ where: { id: resourceId } });
  if (!resource || resource.userId !== userId) {
    throw new Error('Forbidden');
  }
  await db.resource.delete({ where: { id: resourceId } });
});
```

The wrapper guarantees auth happens. You still have to write the per-resource authorization check yourself — there's no shortcut for that.

---

## The mental model

> Treat every Server Action as if it's an unauthenticated HTTP endpoint that an attacker is reading the source for.

If that mental model produces panic about a particular action, fix it. If it doesn't, you're probably missing a check.

Next: [04-server-side-perf.md](04-server-side-perf.md) covers higher-effort, higher-payoff server-side optimizations.
