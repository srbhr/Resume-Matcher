'use client';

import dynamic from 'next/dynamic';
import { useEffectsEnabled } from '@/lib/context/effects-context';

// A client wrapper: `dynamic(..., { ssr: false })` is not allowed in server components, and
// PageFrame is one. The field loads after first paint, so effects never enter first-load JS.
const DitherField = dynamic(() => import('./dither-field').then((mod) => mod.DitherField), {
  ssr: false,
});

/**
 * The page background effect, behind its `relative isolate` parent. Renders nothing when the user
 * has turned background effects off (Settings), leaving the parent's plain Canvas.
 */
export function BackgroundEffect() {
  const enabled = useEffectsEnabled();
  if (!enabled) return null;
  return <DitherField className="absolute inset-0 -z-10 h-full w-full text-steel" />;
}
