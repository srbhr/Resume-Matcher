import { EASE_OUT_EXPO } from '@/lib/motion';

/**
 * The maths of the Block Dissolve route transition, kept apart from the canvas so a frame can be
 * tested for a fixed progress. A port of shaders.com BlockDissolve: a grid of square blocks that
 * vanish in random order, each one through a short softness ramp.
 *
 * Progress follows the reference: 0 is fully there, 1 is fully wiped away. Coverage is what the
 * overlay paints: 1 is a solid block, 0 is nothing, and the values between are the grey steps.
 */

/** Block size as a fraction of the frame width. */
export const BLOCK_SIZE = 0.08;
/** How softly each block fades out (0 = hard-edged). */
export const SOFTNESS = 0.15;

export interface Block {
  x: number;
  y: number;
  size: number;
  /** 1 = solid ink, 0 = gone, in between a grey step. */
  coverage: number;
}

/** A deterministic hash of a grid cell to [0, 1): the order the blocks dissolve in. */
export function blockRank(i: number, j: number, invert = false): number {
  let h = Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(j + 1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  const rank = (h >>> 0) / 4294967296;
  return invert ? 1 - rank : rank;
}

/** Every block of a `width` x `height` frame at `progress`, row by row. */
export function blocks(
  width: number,
  height: number,
  progress: number,
  { blockSize = BLOCK_SIZE, softness = SOFTNESS, invert = false } = {}
): Block[] {
  const size = blockSize * width;
  const cols = Math.ceil(width / size);
  const rows = Math.ceil(height / size);
  const grid: Block[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const rank = blockRank(i, j, invert);
      const gone =
        softness > 0
          ? Math.min(1, Math.max(0, (progress - rank * (1 - softness)) / softness))
          : Number(progress > rank);
      grid.push({ x: i * size, y: j * size, size, coverage: 1 - gone });
    }
  }
  return grid;
}

/** A CSS cubic-bezier as a function of time: x(t) is solved by bisection, then y is read off. */
export function cubicBezierEase([x1, y1, x2, y2]: readonly [number, number, number, number]) {
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let n = 0; n < 24; n++) {
      const t = (lo + hi) / 2;
      if (at(x1, x2, t) < x) lo = t;
      else hi = t;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

export const easeOutExpo = cubicBezierEase(EASE_OUT_EXPO);

export type Rgb = readonly [number, number, number];

/** A `#rgb` or `#rrggbb` token as channels. Anything else reads as black. */
export function parseHex(value: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return [0, 0, 0];
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The grey step for a block: Canvas at coverage 0, ink at coverage 1, mixed in between. */
export function shade(canvas: Rgb, ink: Rgb, coverage: number): string {
  const [r, g, b] = canvas.map((c, k) => Math.round(c + (ink[k] - c) * coverage));
  return `rgb(${r}, ${g}, ${b})`;
}
