# Next.js Critical & High Severity Fixes

Performance optimization guide for Resume Matcher. Based on Vercel's react-best-practices.
Focus: CRITICAL and HIGH impact issues only.

---

## 1. ELIMINATING WATERFALLS (CRITICAL)

Waterfalls are the #1 performance killer. Each sequential `await` adds full network latency.

### 1.1 Parallel Fetching with Promise.all()

```tsx
// ❌ BAD: Sequential - 600ms total (200ms + 200ms + 200ms)
async function getPageData() {
  const user = await fetchUser()
  const posts = await fetchPosts()
  const comments = await fetchComments()
  return { user, posts, comments }
}

// ✅ GOOD: Parallel - 200ms total
async function getPageData() {
  const [user, posts, comments] = await Promise.all([
    fetchUser(),
    fetchPosts(),
    fetchComments()
  ])
  return { user, posts, comments }
}
```

### 1.2 Defer Await to Branches

Move `await` into branches where actually needed.

```tsx
// ❌ BAD: Always waits for analytics even when not used
async function handleSubmit(data: FormData) {
  const analytics = await getAnalytics()
  
  if (!data.get('email')) {
    return { error: 'Email required' }
  }
  
  analytics.track('submit')
  // ...
}

// ✅ GOOD: Only await when needed
async function handleSubmit(data: FormData) {
  if (!data.get('email')) {
    return { error: 'Email required' }
  }
  
  const analytics = await getAnalytics()
  analytics.track('submit')
  // ...
}
```

### 1.3 Start Promises Early, Await Late

```tsx
// ❌ BAD: Sequential in API route
export async function POST(req: Request) {
  const body = await req.json()
  const user = await getUser(body.userId)      // Wait 100ms
  const permissions = await getPermissions(user.id)  // Wait another 100ms
  return Response.json({ user, permissions })
}

// ✅ GOOD: Start early, await late
export async function POST(req: Request) {
  const bodyPromise = req.json()
  const body = await bodyPromise
  
  // Start both immediately
  const userPromise = getUser(body.userId)
  const permissionsPromise = userPromise.then(u => getPermissions(u.id))
  
  const [user, permissions] = await Promise.all([userPromise, permissionsPromise])
  return Response.json({ user, permissions })
}
```

### 1.4 Use Suspense Boundaries for Streaming

```tsx
// ❌ BAD: Entire page waits for slow data
export default async function ResumePage({ params }: { params: { id: string } }) {
  const resume = await getResume(params.id)        // 50ms
  const analysis = await getAnalysis(params.id)    // 500ms - SLOW
  
  return (
    <div>
      <ResumeView resume={resume} />
      <AnalysisPanel analysis={analysis} />
    </div>
  )
}

// ✅ GOOD: Stream slow content with Suspense
import { Suspense } from 'react'

export default async function ResumePage({ params }: { params: { id: string } }) {
  const resume = await getResume(params.id)
  
  return (
    <div>
      <ResumeView resume={resume} />
      <Suspense fallback={<AnalysisSkeleton />}>
        <AnalysisPanel resumeId={params.id} />
      </Suspense>
    </div>
  )
}

// Separate async component
async function AnalysisPanel({ resumeId }: { resumeId: string }) {
  const analysis = await getAnalysis(resumeId)
  return <AnalysisView analysis={analysis} />
}
```

---

## 2. BUNDLE SIZE OPTIMIZATION (CRITICAL)

### 2.1 Avoid Barrel Imports

Barrel files load thousands of unused modules. 200-800ms cold start penalty.

```tsx
// ❌ BAD: Loads 1,583 modules from lucide-react
import { FileText, Upload, Check } from 'lucide-react'

// ✅ GOOD: Direct imports - loads only 3 modules
import FileText from 'lucide-react/dist/esm/icons/file-text'
import Upload from 'lucide-react/dist/esm/icons/upload'
import Check from 'lucide-react/dist/esm/icons/check'

// ✅ ALSO GOOD: Use optimizePackageImports in next.config.js
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons']
  }
}
```

**Commonly affected libraries:** lucide-react, @radix-ui/react-*, react-icons, date-fns, lodash

### 2.2 Dynamic Imports for Heavy Components

```tsx
// ❌ BAD: Monaco editor loaded on initial page load (2MB+)
import { MonacoEditor } from '@/components/monaco-editor'

export default function ResumePage() {
  const [showEditor, setShowEditor] = useState(false)
  return showEditor ? <MonacoEditor /> : <Preview />
}

// ✅ GOOD: Load only when needed
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(
  () => import('@/components/monaco-editor'),
  { 
    loading: () => <EditorSkeleton />,
    ssr: false 
  }
)
```

### 2.3 Defer Third-Party Scripts

Analytics/tracking don't block user interaction. Load after hydration.

```tsx
// ❌ BAD: Analytics blocks hydration
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}

// ✅ GOOD: Lazy load analytics
import dynamic from 'next/dynamic'

const Analytics = dynamic(
  () => import('@vercel/analytics/react').then(m => m.Analytics),
  { ssr: false }
)
```

---

## 3. SERVER ACTIONS SECURITY (CRITICAL)

Server Actions are PUBLIC endpoints. Always verify auth inside each action.

```tsx
// ❌ BAD: No auth check - anyone can delete!
'use server'

export async function deleteResume(resumeId: string) {
  await db.resume.delete({ where: { id: resumeId } })
  return { success: true }
}

// ✅ GOOD: Always verify auth AND ownership
'use server'

import { auth } from '@/lib/auth'

export async function deleteResume(resumeId: string) {
  const session = await auth()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }
  
  // Verify ownership
  const resume = await db.resume.findUnique({ where: { id: resumeId } })
  if (resume?.userId !== session.user.id) {
    throw new Error('Forbidden')
  }
  
  await db.resume.delete({ where: { id: resumeId } })
  revalidatePath('/dashboard')
  return { success: true }
}
```

---

## 4. SERVER-SIDE PERFORMANCE (HIGH)

### 4.1 Use React.cache() for Request Deduplication

```tsx
// ❌ BAD: Same user fetched multiple times per request
// layout.tsx
const user = await getUser(userId)
// page.tsx  
const user = await getUser(userId)  // Duplicate fetch!

// ✅ GOOD: Deduplicate with React.cache()
// lib/data.ts
import { cache } from 'react'

export const getUser = cache(async (userId: string) => {
  return await db.user.findUnique({ where: { id: userId } })
})

// Now both layout.tsx and page.tsx share the same request
```

### 4.2 Minimize Client Component Data

Only send what the client needs.

```tsx
// ❌ BAD: Sending entire user object to client
// Server Component
const user = await getUser(id)  // { id, name, email, passwordHash, ... }
return <ClientProfile user={user} />

// ✅ GOOD: Pick only needed fields
const user = await getUser(id)
return <ClientProfile user={{ name: user.name, avatar: user.avatar }} />
```

### 4.3 Use after() for Non-Blocking Operations

```tsx
// ❌ BAD: User waits for logging to complete
export async function POST(req: Request) {
  const data = await processRequest(req)
  await logToAnalytics(data)  // User waits for this!
  await sendWebhook(data)     // And this!
  return Response.json(data)
}

// ✅ GOOD: Return immediately, run tasks after response
import { after } from 'next/server'

export async function POST(req: Request) {
  const data = await processRequest(req)
  
  after(async () => {
    await logToAnalytics(data)
    await sendWebhook(data)
  })
  
  return Response.json(data)  // Returns immediately
}
```

---

## 5. QUICK CHECKLIST

### Before Every PR:

- [ ] No sequential awaits for independent data
- [ ] Heavy components use `next/dynamic`
- [ ] Icons imported directly, not from barrel
- [ ] Server Actions have auth checks inside
- [ ] Suspense boundaries around slow data
- [ ] `React.cache()` for shared data fetching
- [ ] `after()` for analytics/webhooks

### next.config.js Template:

```js
/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'date-fns'
    ]
  }
}
```

---

## References

- [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
- [Next.js 15 Docs](https://nextjs.org/docs)