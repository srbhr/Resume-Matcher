import { describe, expect, it } from 'vitest';
import {
  RESUME_AUTOSAVE_DEBOUNCE_MS,
  RESUME_AUTOSAVE_MAX_WAIT_MS,
  RESUME_AUTOSAVE_MIN_DELAY_MS,
  nextSaveDelay,
} from '@/lib/builder/save-schedule';

describe('nextSaveDelay', () => {
  it('pins the timing the builder relies on', () => {
    expect([
      RESUME_AUTOSAVE_DEBOUNCE_MS,
      RESUME_AUTOSAVE_MAX_WAIT_MS,
      RESUME_AUTOSAVE_MIN_DELAY_MS,
    ]).toEqual([2500, 12000, 500]);
  });

  // Edges: MAX_WAIT - DEBOUNCE = 9500 (the debounce starts shrinking) and
  // MAX_WAIT - MIN = 11500 (the floor takes over). H-01: never 0, even long
  // after MAX_WAIT, or every keystroke would send a full-document PATCH.
  it.each([
    [0, 2500],
    [9499, 2500],
    [9500, 2500],
    [9501, 2499],
    [11499, 501],
    [11500, 500],
    [11501, 500],
    [12000, 500],
    [600_000, 500],
  ])('after %i ms unsaved waits %i ms', (elapsed, delay) => {
    expect(nextSaveDelay(elapsed)).toBe(delay);
  });
});
