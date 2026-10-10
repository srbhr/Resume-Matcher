import { describe, expect, it } from 'vitest';
import { blockRank, blocks, easeOutExpo, parseHex, shade } from '@/lib/effects/block-dissolve';

const W = 1440;
const H = 900;

/** Block indices in the order they dissolve (lowest rank first), for a grid. */
function dissolveOrder(invert: boolean): number[] {
  const cols = 13;
  const rows = 8;
  const ranks: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) ranks.push(blockRank(i, j, invert));
  return ranks.map((_, k) => k).sort((a, b) => ranks[a] - ranks[b]);
}

describe('blocks: the grid', () => {
  it('lays square blocks of 8% of the width over the whole viewport', () => {
    const grid = blocks(W, H, 0.5);
    const size = 0.08 * W;
    expect(grid.every((b) => b.size === size)).toBe(true);
    // 1440 / 115.2 = 12.5 columns and 900 / 115.2 = 7.8 rows, both rounded up to cover the edge.
    expect(grid).toHaveLength(13 * 8);
    expect(grid[0]).toMatchObject({ x: 0, y: 0 });
    expect(grid[1].x).toBeCloseTo(size);
    expect(grid[13].y).toBeCloseTo(size);
    expect(grid[grid.length - 1].x + size).toBeGreaterThanOrEqual(W);
    expect(grid[grid.length - 1].y + size).toBeGreaterThanOrEqual(H);
  });

  it('takes the block size as a fraction of the width', () => {
    expect(blocks(1000, 1000, 0.5, { blockSize: 0.5 })).toHaveLength(4);
  });
});

describe('blocks: coverage', () => {
  it('is fully opaque at progress 0 and fully gone at progress 1', () => {
    expect(blocks(W, H, 0).every((b) => b.coverage === 1)).toBe(true);
    expect(blocks(W, H, 1).every((b) => b.coverage === 0)).toBe(true);
  });

  it('never rises as progress grows, for any block', () => {
    let before = blocks(W, H, 0);
    for (let p = 0.05; p <= 1.0001; p += 0.05) {
      const now = blocks(W, H, p);
      now.forEach((b, k) => expect(b.coverage).toBeLessThanOrEqual(before[k].coverage + 1e-12));
      before = now;
    }
  });

  it('shows a mix of dark, mid and light blocks mid-transition (the softness ramp)', () => {
    const grid = blocks(W, H, 0.5);
    const dark = grid.filter((b) => b.coverage > 0.9).length;
    const mid = grid.filter((b) => b.coverage >= 0.1 && b.coverage <= 0.9).length;
    const gone = grid.filter((b) => b.coverage < 0.1).length;
    expect(dark).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(0);
    expect(gone).toBeGreaterThan(0);
  });

  it('follows the reference ramp: clamp((progress - rank * (1 - softness)) / softness)', () => {
    const [b] = blocks(W, H, 0.4, { softness: 0.15 });
    const rank = blockRank(0, 0);
    const gone = Math.min(1, Math.max(0, (0.4 - rank * 0.85) / 0.15));
    expect(b.coverage).toBeCloseTo(1 - gone, 12);
  });

  it('has hard edges when softness is 0: every block is on or off', () => {
    for (const p of [0, 0.3, 0.5, 0.9, 1]) {
      expect(
        blocks(W, H, p, { softness: 0 }).every((b) => b.coverage === 0 || b.coverage === 1)
      ).toBe(true);
    }
    expect(blocks(W, H, 0, { softness: 0 }).every((b) => b.coverage === 1)).toBe(true);
    expect(blocks(W, H, 1, { softness: 0 }).every((b) => b.coverage === 0)).toBe(true);
  });
});

describe('blockRank', () => {
  it('is deterministic for a cell and always inside [0, 1)', () => {
    expect(blockRank(3, 4)).toBe(blockRank(3, 4));
    for (let j = 0; j < 20; j++)
      for (let i = 0; i < 20; i++) {
        const r = blockRank(i, j);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(1);
      }
  });

  it('orders the cells at random, not row by row', () => {
    const order = dissolveOrder(false);
    const rowMajor = order.map((_, k) => k);
    expect(order).not.toEqual(rowMajor);
    expect(order).not.toEqual([...rowMajor].reverse());
    // Spread over the range, not clustered: the mean of 104 uniform ranks sits near 0.5.
    const ranks = rowMajor.map((k) => blockRank(k % 13, Math.floor(k / 13)));
    const mean = ranks.reduce((s, r) => s + r, 0) / ranks.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });

  it('gives every cell of the grid its own rank', () => {
    expect(
      new Set(dissolveOrder(false).map((k) => blockRank(k % 13, Math.floor(k / 13)))).size
    ).toBe(104);
  });

  it('is reversed exactly by invert', () => {
    expect(dissolveOrder(true)).toEqual([...dissolveOrder(false)].reverse());
  });

  it('makes invert swap which blocks go first', () => {
    const plain = blocks(W, H, 0.3);
    const inverted = blocks(W, H, 0.3, { invert: true });
    // The block that has fully gone in one is among those still fully there in the other.
    const goneIn = plain.findIndex((b) => b.coverage === 0);
    expect(goneIn).toBeGreaterThanOrEqual(0);
    expect(inverted.map((b) => b.coverage)).not.toEqual(plain.map((b) => b.coverage));
    expect(inverted[goneIn].coverage).toBeGreaterThan(0);
  });
});

describe('easeOutExpo', () => {
  it('runs from 0 to 1, rising all the way, and is front-loaded', () => {
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(1)).toBe(1);
    let prev = 0;
    for (let t = 0.01; t <= 1.0001; t += 0.01) {
      const v = easeOutExpo(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(easeOutExpo(0.25)).toBeGreaterThan(0.5);
    expect(easeOutExpo(-1)).toBe(0);
    expect(easeOutExpo(2)).toBe(1);
  });

  it('matches the CSS cubic-bezier(0.16, 1, 0.3, 1) curve at known points', () => {
    // Solved independently: x(t) = 3(1-t)^2 t 0.16 + 3(1-t) t^2 0.3 + t^3, y(t) = 3(1-t)^2 t + 3(1-t) t^2 + t^3
    const x = 3 * 0.25 * 0.5 * 0.16 + 3 * 0.5 * 0.25 * 0.3 + 0.125;
    const y = 3 * 0.25 * 0.5 + 3 * 0.5 * 0.25 + 0.125;
    expect(easeOutExpo(x)).toBeCloseTo(y, 4);
  });
});

describe('colour', () => {
  it('reads #rrggbb and #rgb tokens, and falls back to black for anything else', () => {
    expect(parseHex('#1d4ed8')).toEqual([29, 78, 216]);
    expect(parseHex(' #FFF ')).toEqual([255, 255, 255]);
    expect(parseHex('')).toEqual([0, 0, 0]);
    expect(parseHex('rgb(1, 2, 3)')).toEqual([0, 0, 0]);
  });

  it('mixes canvas to ink by coverage: none is canvas, all is ink, half is the midpoint', () => {
    const ink = [0, 0, 0] as const;
    const canvas = [240, 240, 232] as const;
    expect(shade(canvas, ink, 1)).toBe('rgb(0, 0, 0)');
    expect(shade(canvas, ink, 0)).toBe('rgb(240, 240, 232)');
    expect(shade(canvas, ink, 0.5)).toBe('rgb(120, 120, 116)');
  });
});
