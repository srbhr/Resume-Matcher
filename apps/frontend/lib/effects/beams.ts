/**
 * The maths of the Pixel Beams background, kept apart from the canvas so a frame can be tested
 * for a fixed time. A port of `pattern="beams"` from the website's `DitherField.astro`: square
 * dots on a grid, switched on by an 8x8 Bayer matrix, in diagonal beams with streaks travelling
 * along them towards the top right.
 */

/** Frames per second. Low on purpose: it is atmosphere, not animation. */
export const BEAMS_FPS = 12;
/** Dot size as a fraction of the cell pitch. */
export const BEAMS_DOT = 0.5;
/** Dot pitch in CSS pixels. */
export const BEAMS_CELL = 6;

const BAYER_SIZE = 8;

/** 8x8 Bayer matrix, row-major, levels 0-63. Each level tiles the previous one four times, offset 0, 2, 3, 1. */
export const BAYER: readonly number[] = (() => {
  let m = [[0]];
  while (m.length < BAYER_SIZE) {
    const s = m.length;
    const prev = m;
    m = Array.from({ length: s * 2 }, (_, y) =>
      Array.from(
        { length: s * 2 },
        (_, x) =>
          4 * prev[y % s][x % s] +
          [
            [0, 2],
            [3, 1],
          ][Math.floor(y / s)][Math.floor(x / s)]
      )
    );
  }
  return m.flat();
})();

/** Brightness 0-0.85 at a point (CSS px) and time (s). The cap keeps a crest from lighting every dot. `litCells` evaluates the same maths, factored by grid. */
export function beamBrightness(x: number, y: number, t: number): number {
  const across = (x + y) * 0.7071;
  const along = (x - y) * 0.7071; // grows towards the top right
  const beam =
    (0.5 + 0.5 * Math.sin(across * 0.022 + 1.2 * Math.sin(across * 0.005 + t * 0.08))) ** 6;
  const streak = (0.5 + 0.5 * Math.sin(along * 0.012 - t * 0.6 + across * 0.01)) ** 2;
  return beam * (0.15 + 0.85 * streak) * 0.85;
}

/** The Bayer level of each matrix cell as a brightness threshold. */
const BAYER_THRESHOLD = Float64Array.from(BAYER, (level) => (level + 0.5) / 64);

/**
 * What a grid fixes for good. A cell sits at `x = (col + 0.5) * cell`, `y = (row + 0.5) * cell`, so
 * `across` is the same for every cell on a diagonal (`col + row`) and `along` for every cell on an
 * anti-diagonal (`col - row`): the terms of the maths that do not move with time are per diagonal,
 * not per cell, and a frame needs only `cols + rows` of each.
 */
interface BeamGrid {
  /** `across * 0.022`, per diagonal. */
  bandPhase: Float64Array;
  /** `across * 0.005`, per diagonal. */
  bandWobble: Float64Array;
  /** `across * 0.01`, per diagonal. */
  streakAcross: Float64Array;
  /** `along * 0.012`, per anti-diagonal (`col - row + rows - 1`). */
  streakAlong: Float64Array;
  /** The beam of each diagonal in the frame being drawn. */
  beam: Float64Array;
}

/** A few grids at once (a resize makes a new one), oldest out first. */
const MAX_GRIDS = 4;
const grids = new Map<string, BeamGrid>();

function beamGrid(cols: number, rows: number, cell: number): BeamGrid {
  const key = `${cols}x${rows}@${cell}`;
  let grid = grids.get(key);
  if (!grid) {
    const n = cols + rows - 1;
    grid = {
      bandPhase: new Float64Array(n),
      bandWobble: new Float64Array(n),
      streakAcross: new Float64Array(n),
      streakAlong: new Float64Array(n),
      beam: new Float64Array(n),
    };
    for (let d = 0; d < n; d++) {
      const across = (d + 1) * cell * 0.7071;
      grid.bandPhase[d] = across * 0.022;
      grid.bandWobble[d] = across * 0.005;
      grid.streakAcross[d] = across * 0.01;
      grid.streakAlong[d] = (d - (rows - 1)) * cell * 0.7071 * 0.012;
    }
    if (grids.size >= MAX_GRIDS) grids.delete(grids.keys().next().value as string);
    grids.set(key, grid);
  }
  return grid;
}

/**
 * The dots lit at time `t` (s), as row-major cell indices (`row * cols + col`). The same cells as
 * thresholding `beamBrightness` per cell, but per frame it does only what time moves: a beam per
 * diagonal and a streak per cell.
 */
export function litCells(cols: number, rows: number, t: number, cell = BEAMS_CELL): number[] {
  const lit: number[] = [];
  if (!(cols > 0 && rows > 0)) return lit;
  const { bandPhase, bandWobble, streakAcross, streakAlong, beam } = beamGrid(cols, rows, cell);
  for (let d = 0; d < beam.length; d++) {
    beam[d] = (0.5 + 0.5 * Math.sin(bandPhase[d] + 1.2 * Math.sin(bandWobble[d] + t * 0.08))) ** 6;
  }
  const drift = t * 0.6;
  for (let r = 0; r < rows; r++) {
    const bayerRow = (r % BAYER_SIZE) * BAYER_SIZE;
    const antiDiagonal = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const streak =
        (0.5 + 0.5 * Math.sin(streakAlong[c + antiDiagonal] - drift + streakAcross[c + r])) ** 2;
      if (
        beam[c + r] * (0.15 + 0.85 * streak) * 0.85 >
        BAYER_THRESHOLD[bayerRow + (c % BAYER_SIZE)]
      ) {
        lit.push(r * cols + c);
      }
    }
  }
  return lit;
}

/**
 * The animation clock after a frame. `last` is the previous drawn frame's timestamp (ms), 0 for the
 * first frame of a run. The step is capped at 0.2 s so a throttled or resumed tab never jumps.
 */
export function advanceTime(t: number, last: number, now: number): number {
  return t + (last ? Math.min((now - last) / 1000, 0.2) : 0);
}
