'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { createGlRunner, readSwissColor, type GlRunner } from '@/lib/effects/gl-runner';
import { DURATION } from '@/lib/motion';
import { cn } from '@/lib/utils';

export type EffectIntensity = 'idle' | 'active';

/** What one intensity looks like: animation speed (1 = the preset's own) and brightness (0-1). */
export interface IntensityProfile {
  speed: number;
  level: number;
}

interface GlCanvasProps {
  className?: string;
  /** Fragment shader. */
  source: string;
  /** Frame-rate cap. */
  fps: number;
  /** Shader colour uniform -> `--sw-*` token. */
  tokens: Record<string, string>;
  profiles: Record<EffectIntensity, IntensityProfile>;
  intensity: EffectIntensity;
  /** WebGL is unavailable, the shader failed, or the browser took the context away. */
  onFail: () => void;
}

/** Share of the gap to the new intensity covered per drawn frame: about half a second to settle. */
const EASE = 0.12;

/**
 * The canvas behind a GL effect: fills its positioned parent, is inert and decorative, fades in
 * over `DURATION.surface`, and hands the drawing to `createGlRunner`. Reduced motion draws one
 * still frame. Switching `intensity` eases speed and brightness without restarting the context.
 *
 * The canvas is created in the effect, not in JSX: disposing a runner loses its WebGL context for
 * good, and a canvas that has lost one hands the same dead context back (React StrictMode mounts,
 * unmounts and mounts again on the same node), so every start gets a fresh canvas.
 */
export function GlCanvas({
  className,
  source,
  fps,
  tokens,
  profiles,
  intensity,
  onFail,
}: GlCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = !!useReducedMotion();
  const intensityRef = useRef(intensity);
  const onFailRef = useRef(onFail);
  const runnerRef = useRef<GlRunner | null>(null);
  const paintedIntensity = useRef(intensity);

  useEffect(() => {
    intensityRef.current = intensity;
    onFailRef.current = onFail;
  });

  useEffect(() => {
    const wrapper = ref.current;
    if (!wrapper) return;
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    wrapper.appendChild(canvas);

    const colors = Object.fromEntries(
      Object.entries(tokens).map(([uniform, token]) => [uniform, readSwissColor(wrapper, token)])
    );
    let { speed, level } = profiles[intensityRef.current];
    const runner = createGlRunner(canvas, {
      source,
      fps,
      still: reduced,
      uniforms: () => {
        const to = profiles[intensityRef.current];
        level = reduced ? to.level : level + (to.level - level) * EASE;
        return { ...colors, u_level: level };
      },
      speed: () => {
        speed += (profiles[intensityRef.current].speed - speed) * EASE;
        return speed;
      },
      onLost: () => onFailRef.current(),
    });
    if (!runner) {
      canvas.remove();
      onFailRef.current();
      return;
    }
    runnerRef.current = runner;
    // The runner's layout read has already settled the faded-out style, so this transitions.
    wrapper.style.opacity = '1';

    return () => {
      runnerRef.current = null;
      runner.dispose();
      canvas.remove();
    };
  }, [reduced, source, fps, tokens, profiles]);

  // A still frame has no loop to pick up a new intensity, so repaint it.
  useEffect(() => {
    if (reduced && paintedIntensity.current !== intensity) runnerRef.current?.redraw();
    paintedIntensity.current = intensity;
  }, [intensity, reduced]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      style={{ opacity: 0, transition: `opacity ${DURATION.surface * 1000}ms` }}
    />
  );
}
