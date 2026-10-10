import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockDissolve } from '@/components/effects/block-dissolve';

// jsdom has no canvas or animation frames: stand in for both, and drive the frames by hand.
interface Fill {
  style: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
let fills: Fill[] = [];
let clears = 0;
const ctx = {
  fillStyle: '',
  clearRect: vi.fn(() => {
    clears++;
    fills = [];
  }),
  fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
    fills.push({ style: ctx.fillStyle, x, y, w, h });
  }),
};
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

function runFrame(now: number) {
  const [id, cb] = [...frames.entries()][0];
  frames.delete(id);
  act(() => cb(now));
}

beforeEach(() => {
  fills = [];
  clears = 0;
  frames.clear();
  nextFrame = 1;
  document.documentElement.style.setProperty('--sw-ink', '#000000');
  document.documentElement.style.setProperty('--sw-canvas', '#f0f0e8');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 1000,
    height: 600,
  } as DOMRect);
  vi.stubGlobal('devicePixelRatio', 1);
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      frames.set(nextFrame, cb);
      return nextFrame++;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      frames.delete(id);
    })
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty('--sw-ink');
  document.documentElement.style.removeProperty('--sw-canvas');
});

const styles = () => new Set(fills.map((f) => f.style));

describe('BlockDissolve overlay', () => {
  it('is a fixed, inert, decorative full-screen canvas above everything', () => {
    const { container } = render(<BlockDissolve phase="cover" since={0} />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas).toHaveClass(
      'fixed',
      'inset-0',
      'z-[100]',
      'pointer-events-none',
      'h-full',
      'w-full'
    );
    expect(canvas).toHaveAttribute('data-phase', 'cover');
  });

  it('sizes the canvas to the viewport in device pixels, capped at a ratio of 2', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { container } = render(<BlockDissolve phase="cover" since={0} />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1200);
  });

  it('covers: starts clear, mixes dark, mid and light blocks on the way, ends all ink', () => {
    render(<BlockDissolve phase="cover" since={0} />);
    expect(clears).toBe(1); // the first frame is drawn at mount
    expect(fills).toHaveLength(0); // progress 1: nothing yet, the page shows
    runFrame(0);

    // Part-way through the 250 ms cover, using the ease-out curve.
    runFrame(60);
    const mid = styles();
    expect(mid.has('rgb(0, 0, 0)')).toBe(true); // ink, from the tokens
    expect(mid.size).toBeGreaterThan(2); // plus grey steps
    for (const s of mid) expect(s).toMatch(/^rgb\(\d+, \d+, \d+\)$/);

    runFrame(250);
    // Every block, all ink. 1000 px wide: 80 px blocks, 13 columns by 8 rows.
    expect(fills).toHaveLength(13 * 8);
    expect(styles()).toEqual(new Set(['rgb(0, 0, 0)']));
    expect(frames.size).toBe(0); // the loop stops by itself
  });

  it('draws tiles with no gaps or overlaps, clipped to the canvas', () => {
    render(<BlockDissolve phase="covered" since={0} />);
    const xs = [...new Set(fills.map((f) => f.x))].sort((a, b) => a - b);
    for (let k = 1; k < xs.length; k++) {
      const left = fills.find((f) => f.x === xs[k - 1])!;
      expect(left.x + left.w).toBe(xs[k]);
    }
    const right = fills.reduce((a, b) => (a.x + a.w > b.x + b.w ? a : b));
    expect(right.x + right.w).toBeGreaterThanOrEqual(1000);
  });

  it('holds fully covered while it waits for the route', () => {
    render(<BlockDissolve phase="covered" since={0} />);
    expect(fills).toHaveLength(13 * 8);
    expect(styles()).toEqual(new Set(['rgb(0, 0, 0)']));
    expect(frames.size).toBe(0); // nothing moves, so nothing is scheduled
  });

  it('reveals: starts all ink, ends with nothing drawn', () => {
    render(<BlockDissolve phase="reveal" since={0} />);
    expect(fills).toHaveLength(13 * 8);
    runFrame(100);
    expect(styles().size).toBeGreaterThan(2);
    runFrame(250);
    expect(fills).toHaveLength(0);
    expect(clears).toBeGreaterThan(0);
    expect(frames.size).toBe(0);
  });

  it('continues from the covered hold into the reveal when the phase changes', () => {
    const { rerender } = render(<BlockDissolve phase="covered" since={0} />);
    rerender(<BlockDissolve phase="reveal" since={0} />);
    expect(fills).toHaveLength(13 * 8); // no gap, no flash, between the two phases
    runFrame(250);
    expect(fills).toHaveLength(0);
  });

  it('takes its time from the provider: a late mount joins part-way instead of starting over', () => {
    // The provider began the cover 60 ms ago (the chunk was cold): the first frame is already mixed.
    vi.spyOn(performance, 'now').mockReturnValue(1060);
    render(<BlockDissolve phase="cover" since={1000} />);
    expect(fills.length).toBeGreaterThan(0);
    expect(styles().size).toBeGreaterThan(2);
    runFrame(1250);
    expect(fills).toHaveLength(13 * 8);
  });

  it('draws a phase that is already over in its final state, and schedules nothing', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    const { rerender } = render(<BlockDissolve phase="cover" since={1000} />);
    expect(fills).toHaveLength(13 * 8);
    expect(frames.size).toBe(0);
    rerender(<BlockDissolve phase="reveal" since={1000} />);
    expect(fills).toHaveLength(0);
    expect(frames.size).toBe(0);
  });

  it('stops its frames when it unmounts', () => {
    const { unmount } = render(<BlockDissolve phase="cover" since={0} />);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });
});
