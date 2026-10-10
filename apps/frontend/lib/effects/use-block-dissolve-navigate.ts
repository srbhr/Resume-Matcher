'use client';

import { createContext, useCallback, useContext } from 'react';
import type { MouseEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { useEffectsEnabled } from '@/lib/context/effects-context';

/** The one route the transition is for. */
export const DASHBOARD_HREF = '/dashboard';

interface BlockDissolveControls {
  /** Begin the transition and navigate to the dashboard, at once. */
  start: () => void;
  /** Warm the dashboard route and the overlay code, so the click has nothing left to load. */
  prepare: () => void;
}

/** Set by `BlockDissolveProvider`. Without one (print routes, isolated tests) there is no effect. */
export const BlockDissolveContext = createContext<BlockDissolveControls | null>(null);

/**
 * Props for the one link that runs the Block Dissolve: Home to Dashboard. A plain left click runs
 * the transition (and navigates immediately); anything else, and every case where effects are off
 * or motion is reduced, is left to the link's own behaviour. Enter on a focused link arrives as a
 * click, so the keyboard gets the same effect.
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

  return { onClick, prepare };
}
