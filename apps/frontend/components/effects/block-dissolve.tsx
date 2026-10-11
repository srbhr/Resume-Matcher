'use client';

import { useLayoutEffect, useRef } from 'react';
import { blocks, easeOutExpo, parseHex, shade } from '@/lib/effects/block-dissolve';
import { DURATION } from '@/lib/motion';

export type DissolvePhase = 'cover' | 'covered' | 'reveal';

const MAX_DPR = 2;

/** Progress runs 1 to 0 to cover (blocks fill in), holds at 0, then 0 to 1 to reveal (they vanish). */
const RANGE: Record<DissolvePhase, readonly [number, number]> = {
  cover: [1, 0],
  covered: [0, 0],
  reveal: [0, 1],
};

/**
 * Block Dissolve: a fixed, full-screen canvas of square ink blocks that fill in, and later vanish,
 * in random order (`lib/effects/block-dissolve`). It paints one phase of the Home to Dashboard
 * route transition (the cover over Home, a hold, then the reveal of the Dashboard); the provider
 * owns the sequence and when the overlay is mounted. Ink and Canvas
 * come from the `--sw-*` tokens, and the grey steps in between mix the two. Draws only while a
 * phase is animating, and never takes a click. `since` is when the phase began, on the
 * `performance.now()` clock.
 */
export function BlockDissolve({ phase, since }: { phase: DissolvePhase; since: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Device pixels throughout, so every block edge lands on a whole pixel. The size is only set
    // when it changes: assigning it clears the canvas, and a phase change must not flash.
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const tokens = getComputedStyle(document.documentElement);
    const ink = parseHex(tokens.getPropertyValue('--sw-ink'));
    const page = parseHex(tokens.getPropertyValue('--sw-canvas'));

    const draw = (progress: number) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (const block of blocks(width, height, progress)) {
        if (block.coverage <= 0) continue;
        ctx.fillStyle = shade(page, ink, block.coverage);
        // Rounded edges, not rounded sizes: neighbours share an edge, so no seam and no overlap.
        const x = Math.round(block.x);
        const y = Math.round(block.y);
        ctx.fillRect(
          x,
          y,
          Math.round(block.x + block.size) - x,
          Math.round(block.y + block.size) - y
        );
      }
    };

    // The phase's clock is the provider's: `since` is when it began (performance.now), so a late
    // mount joins part-way. The first frame is drawn here, before the browser paints, not on the
    // next animation frame.
    const [from, to] = RANGE[phase];
    // The cover is quicker than the reveal: the navigation waits for it, the reveal waits for nothing.
    const duration = (phase === 'cover' ? DURATION.routeCover : DURATION.routeTransition) * 1000;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(Math.max((now - since) / duration, 0), 1);
      draw(from + (to - from) * easeOutExpo(t));
      if (t < 1 && from !== to) frame = requestAnimationFrame(step);
    };
    step(performance.now());
    return () => cancelAnimationFrame(frame);
  }, [phase, since]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-phase={phase}
      className="pointer-events-none fixed inset-0 z-[100] h-full w-full"
    />
  );
}
