import { afterEach, describe, expect, it, vi } from 'vitest';
import { BAYER, advanceTime, beamBrightness, litCells } from '@/lib/effects/beams';

// Reference copy of the website's DitherField `beams` pattern
// (Resume-Matcher-Website/.../DitherField.astro). The port must light exactly the same cells.
function referenceBrightness(x: number, y: number, t: number): number {
  const across = (x + y) * 0.7071;
  const along = (x - y) * 0.7071;
  const beam =
    (0.5 + 0.5 * Math.sin(across * 0.022 + 1.2 * Math.sin(across * 0.005 + t * 0.08))) ** 6;
  const streak = (0.5 + 0.5 * Math.sin(along * 0.012 - t * 0.6 + across * 0.01)) ** 2;
  return beam * (0.15 + 0.85 * streak) * 0.85;
}

describe('Bayer matrix', () => {
  it('is the 8x8 ordered-dither matrix: every level 0-63 exactly once', () => {
    expect(BAYER).toHaveLength(64);
    expect([...BAYER].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    expect(Array.from(BAYER.slice(0, 8))).toEqual([0, 32, 8, 40, 2, 34, 10, 42]);
    expect(Array.from(BAYER.slice(56, 64))).toEqual([63, 31, 55, 23, 61, 29, 53, 21]);
  });
});

describe('beamBrightness', () => {
  it('matches the website maths at fixed points', () => {
    expect(beamBrightness(120, 60, 3.5)).toBeCloseTo(0.00002004961996565415, 12);
    expect(beamBrightness(0, 0, 0)).toBeCloseTo(0.004814453125, 12);
    expect(beamBrightness(300, 200, 41)).toBeCloseTo(0.012279055911035487, 12);
  });

  it('is a pure function of position and time, capped under the beam peak', () => {
    expect(beamBrightness(77, 31, 8.25)).toBe(beamBrightness(77, 31, 8.25));
    for (let i = 0; i < 200; i++) {
      const v = beamBrightness(i * 13, i * 7, i * 0.9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0.85);
    }
  });
});

describe('litCells', () => {
  it('is deterministic for a fixed time: same cells, same order', () => {
    expect(litCells(64, 40, 12.5)).toEqual(litCells(64, 40, 12.5));
  });

  it('lights the cells the website lights, as row-major indices', () => {
    for (const t of [0, 12.5, 90]) {
      const expected: number[] = [];
      for (let r = 0; r < 40; r++) {
        for (let c = 0; c < 64; c++) {
          if (
            referenceBrightness((c + 0.5) * 6, (r + 0.5) * 6, t) >
            (BAYER[(r % 8) * 8 + (c % 8)] + 0.5) / 64
          ) {
            expected.push(r * 64 + c);
          }
        }
      }
      expect(litCells(64, 40, t)).toEqual(expected);
    }
  });

  it('pins the frame at t=0, 12.5 and 90 (count and checksum)', () => {
    const summary = (t: number) => {
      const cells = litCells(64, 40, t);
      return [cells.length, cells.reduce((a, b) => a + b, 0)];
    };
    expect(summary(0)).toEqual([202, 222999]);
    expect(summary(12.5)).toEqual([188, 335421]);
    expect(summary(90)).toEqual([336, 447000]);
  });

  it('moves with time and stays within the grid', () => {
    expect(litCells(64, 40, 0)).not.toEqual(litCells(64, 40, 12.5));
    for (const i of litCells(64, 40, 90)) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(64 * 40);
    }
  });

  it('honours the cell pitch', () => {
    expect(litCells(10, 10, 5, 12)).not.toEqual(litCells(10, 10, 5, 6));
    expect(litCells(0, 0, 5)).toEqual([]);
  });
});

// The per-cell loop `litCells` was before it cached the grid: every cell through `beamBrightness`.
function perCellLitCells(cols: number, rows: number, t: number, cell: number): number[] {
  const lit: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (
        beamBrightness((c + 0.5) * cell, (r + 0.5) * cell, t) >
        (BAYER[(r % 8) * 8 + (c % 8)] + 0.5) / 64
      ) {
        lit.push(r * cols + c);
      }
    }
  }
  return lit;
}

describe('litCells: the cached grid', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lights exactly the cells the per-cell maths lights, on any grid, pitch and time', () => {
    const grids: [number, number][] = [
      [64, 40],
      [7, 31],
      [300, 3],
      [1, 1],
      [1, 25],
    ];
    const times = [0, 0.37, 12.5, 90, 1234.5];
    // Grids and pitches interleaved, so a grid is looked up again after others were built.
    for (const cell of [6, 12, 5.5, 7.3]) {
      for (const t of times) {
        for (const [cols, rows] of grids) {
          expect(litCells(cols, rows, t, cell)).toEqual(perCellLitCells(cols, rows, t, cell));
        }
      }
    }
  });

  it('is unaffected by the grids it has cached and dropped', () => {
    const before = litCells(33, 21, 4.2);
    for (let n = 1; n <= 10; n++) litCells(n, n, 4.2); // more grids than are kept
    expect(litCells(33, 21, 4.2)).toEqual(before);
    expect(before).toEqual(perCellLitCells(33, 21, 4.2, 6));
  });

  it('does only the time-dependent work in a frame: a sine per cell and two per diagonal', () => {
    const cols = 64;
    const rows = 40;
    litCells(cols, rows, 1); // the first frame builds the grid
    const sin = vi.spyOn(Math, 'sin');
    litCells(cols, rows, 2);
    expect(sin.mock.calls.length).toBe(cols * rows + 2 * (cols + rows - 1));
  });
});

describe('advanceTime', () => {
  it('does not move on the first frame after a start', () => {
    expect(advanceTime(4, 0, 5000)).toBe(4);
  });

  it('adds the elapsed seconds, capped at 0.2 so a paused tab cannot jump the animation', () => {
    expect(advanceTime(4, 1000, 1100)).toBeCloseTo(4.1, 10);
    expect(advanceTime(4, 1000, 9000)).toBeCloseTo(4.2, 10);
  });
});
