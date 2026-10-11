'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { BEAMS_CELL, BEAMS_DOT, BEAMS_FPS, advanceTime, litCells } from '@/lib/effects/beams';
import { DURATION } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** How opaque the dots are over Canvas. The dot colour itself is the element's text colour. */
const DOT_ALPHA = 0.3;
const MAX_DPR = 2;

/**
 * Pixel Beams: square dots in diagonal beams, switched on by a Bayer matrix (`lib/effects/beams`).
 * Fills the box its classes give it (the background effect makes it `fixed inset-0`, one screen);
 * the dot colour is `currentColor`, so set it with a token class such as `text-steel`. Draws every dot as one path, at 12 fps, only while on screen and while
 * the tab is visible. Reduced motion draws one still frame and no loop.
 */
export function DitherField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = !!useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let cols = 0;
    let rows = 0;
    let pitch = 0;
    let size = 0;
    let color = '';
    let t = 0;

    // Device pixels throughout, so every dot is the same whole number of pixels.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      pitch = BEAMS_CELL * dpr;
      size = Math.max(1, Math.round(pitch * BEAMS_DOT));
      cols = Math.ceil(canvas.width / pitch);
      rows = Math.ceil(canvas.height / pitch);
      color = getComputedStyle(canvas).color;
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      ctx.globalAlpha = DOT_ALPHA;
      ctx.beginPath();
      for (const i of litCells(cols, rows, t)) {
        const col = i % cols;
        const row = (i - col) / cols;
        ctx.rect(Math.round(col * pitch), Math.round(row * pitch), size, size);
      }
      ctx.fill();
    };

    resize();
    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw();
    });
    resizeObserver.observe(canvas);
    draw();
    // The layout read in resize() has already settled the faded-out style, so this transitions.
    canvas.style.opacity = '1';
    if (reduced) return () => resizeObserver.disconnect();

    let visible = false;
    let last = 0;
    let frame = 0;
    const tick = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      if (now - last >= 1000 / BEAMS_FPS) {
        t = advanceTime(t, last, now);
        draw();
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    intersection.observe(canvas);
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none', className)}
      style={{ opacity: 0, transition: `opacity ${DURATION.surface * 1000}ms` }}
    />
  );
}
