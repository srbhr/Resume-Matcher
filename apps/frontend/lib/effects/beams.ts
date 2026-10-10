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

/** Brightness 0-0.85 at a point (CSS px) and time (s). The cap keeps a crest from lighting every dot. */
export function beamBrightness(x: number, y: number, t: number): number {
  const across = (x + y) * 0.7071;
  const along = (x - y) * 0.7071; // grows towards the top right
  const beam =
    (0.5 + 0.5 * Math.sin(across * 0.022 + 1.2 * Math.sin(across * 0.005 + t * 0.08))) ** 6;
  const streak = (0.5 + 0.5 * Math.sin(along * 0.012 - t * 0.6 + across * 0.01)) ** 2;
  return beam * (0.15 + 0.85 * streak) * 0.85;
}

/** The dots lit at time `t` (s), as row-major cell indices (`row * cols + col`). */
export function litCells(cols: number, rows: number, t: number, cell = BEAMS_CELL): number[] {
  const lit: number[] = [];
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * cell;
    const bayerRow = (r % BAYER_SIZE) * BAYER_SIZE;
    for (let c = 0; c < cols; c++) {
      if (
        beamBrightness((c + 0.5) * cell, y, t) >
        (BAYER[bayerRow + (c % BAYER_SIZE)] + 0.5) / 64
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
