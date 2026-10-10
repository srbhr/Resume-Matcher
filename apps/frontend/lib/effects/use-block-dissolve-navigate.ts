'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { useEffectsEnabled } from '@/lib/context/effects-context';

/** The one route the transition is for. */
export const DASHBOARD_HREF = '/dashboard';

interface BlockDissolveControls {
  /** Begin the transition: cover Home, then navigate to the dashboard. */
  start: () => void;
  /** Warm the dashboard route and the overlay code, so the click has nothing left to load. */
  prepare: () => void;
}

/** Set by `BlockDissolveProvider`. Without one (print routes, isolated tests) there is no effect. */
export const BlockDissolveContext = createContext<BlockDissolveControls | null>(null);

/** The chunk and the route are warmed once the browser is idle, so a touch tap (no hover) is ready. */
const IDLE_FALLBACK_MS = 200;

/**
 * Props for the one link that runs the Block Dissolve: Home to Dashboard. A plain left click runs
 * the transition (the provider covers Home, then navigates); anything else, and every case where
 * effects are off or motion is reduced, is left to the link's own behaviour, a plain and immediate
 * navigation. Enter on a focused link arrives as a click, so the keyboard gets the same effect.
 * While the effect is live, the route and the overlay chunk are also warmed once on first idle.
 */
export function useBlockDissolveNavigate() {
  const controls = useContext(BlockDissolveContext);
  const effectsOn = useEffectsEnabled();
  const reduced = useReducedMotion();
  const live = controls !== null && effectsOn && !reduced;

  const onClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (!live || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.currentTarget.target && e.currentTarget.target !== '_self') return;
      e.preventDefault();
      controls.start();
    },
    [live, controls]
  );

  const prepare = useCallback(() => {
    if (live) controls.prepare();
  }, [live, controls]);

  // Once per mount, not once per render: the controls change identity as the phases run.
  const prepareRef = useRef(prepare);
  useEffect(() => {
    prepareRef.current = prepare;
  }, [prepare]);
  useEffect(() => {
    if (!live) return;
    const run = () => prepareRef.current();
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run);
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, IDLE_FALLBACK_MS);
    return () => clearTimeout(id);
  }, [live]);

  return { onClick, prepare };
}
