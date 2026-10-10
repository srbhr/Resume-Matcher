'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockDissolveContext, DASHBOARD_HREF } from '@/lib/effects/use-block-dissolve-navigate';
import { DURATION } from '@/lib/motion';

// The overlay is its own lazy chunk: it is not in any route's first-load JS. One loader serves
// both the render and `prepare`, so hovering or focusing the link warms exactly the chunk the click
// renders (two separate `import()` sites become two chunks in a Turbopack build). A failed load
// (a stale chunk after a deploy) only skips the effect, never the page.
const loadOverlay = () => import('@/components/effects/block-dissolve');
const BlockDissolve = dynamic(
  () =>
    loadOverlay()
      .then((mod) => mod.BlockDissolve)
      .catch(() => () => null),
  {
    ssr: false,
  }
);

type Phase = 'idle' | 'cover' | 'covered' | 'reveal';

const COVER_MS = DURATION.routeCover * 1000;
const REVEAL_MS = DURATION.routeTransition * 1000;
/** However slow the route, the screen is never left covered for longer than this after the push. */
const SAFETY_MS = 1500;

/**
 * Owns the Home to Dashboard Block Dissolve, above the route boundary so it survives the page
 * swap. A click first covers Home over 200 ms (the one deliberate delay before a navigation, once
 * per session); only then does `router.push` run. Once the route is /dashboard the blocks vanish
 * over 250 ms and the overlay unmounts. If the route is slow the safety timeout, measured from the
 * push, reveals anyway. Every phase ends on a timer, not on a drawn frame, so a hidden tab or a
 * failed load cannot strand the overlay. Each phase carries the time it began, so an overlay that
 * mounts late (a cold chunk) joins mid-way instead of starting over and jumping when the next
 * phase arrives.
 */
export function BlockDissolveProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [{ phase, since }, setState] = useState<{ phase: Phase; since: number }>({
    phase: 'idle',
    since: 0,
  });

  // The cover timer must not restart when the router object changes identity.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const enter = useCallback(
    (next: Phase) => setState({ phase: next, since: performance.now() }),
    []
  );

  const start = useCallback(() => {
    if (phase === 'idle') enter('cover');
  }, [phase, enter]);

  const prepare = useCallback(() => {
    router.prefetch(DASHBOARD_HREF);
    loadOverlay().catch(() => {});
  }, [router]);

  // Home is covered: now navigate. The phase clock for the safety timeout starts here.
  useEffect(() => {
    if (phase !== 'cover') return;
    const id = setTimeout(() => {
      enter('covered');
      routerRef.current.push(DASHBOARD_HREF);
    }, COVER_MS);
    return () => clearTimeout(id);
  }, [phase, enter]);

  useEffect(() => {
    if (phase === 'covered' && pathname === DASHBOARD_HREF) enter('reveal');
  }, [phase, pathname, enter]);

  // Leaving `covered` (by the route or by this) cancels the timer, so it can never restart a reveal.
  useEffect(() => {
    if (phase !== 'covered') return;
    const id = setTimeout(() => enter('reveal'), SAFETY_MS);
    return () => clearTimeout(id);
  }, [phase, enter]);

  useEffect(() => {
    if (phase !== 'reveal') return;
    const id = setTimeout(() => enter('idle'), REVEAL_MS);
    return () => clearTimeout(id);
  }, [phase, enter]);

  const controls = useMemo(() => ({ start, prepare }), [start, prepare]);

  return (
    <BlockDissolveContext.Provider value={controls}>
      {children}
      {phase !== 'idle' && <BlockDissolve phase={phase} since={since} />}
    </BlockDissolveContext.Provider>
  );
}
