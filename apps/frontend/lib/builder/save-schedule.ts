/** When the builder saves: the autosave debounce and the formatting save delay. */

export const RESUME_AUTOSAVE_DEBOUNCE_MS = 2500;
export const FORMATTING_SAVE_DEBOUNCE_MS = 600;
export const RESUME_AUTOSAVE_MAX_WAIT_MS = 12000;
// Floor for the computed delay. Without it, once an unsynced streak exceeds the
// max wait the delay pins to 0 and every keystroke schedules an immediate
// full-document PATCH.
// This floor deliberately wins over the remaining max-wait budget, so a save
// can land up to MIN_DELAY after MAX_WAIT elapses. MAX_WAIT is a target for
// how long edits may stay unsynced, not a hard deadline — dropping the floor
// to honour it exactly is what produced one PATCH per keystroke.
export const RESUME_AUTOSAVE_MIN_DELAY_MS = 500;

/**
 * How long autosave waits after an edit. Normally the debounce; once edits have
 * stayed unsaved for close to MAX_WAIT, less, so a long typing streak still
 * saves; never under MIN_DELAY (see above).
 *
 * @param elapsedSinceStreakStart ms since the first edit not yet saved (0 if none)
 */
export function nextSaveDelay(elapsedSinceStreakStart: number): number {
  return Math.max(
    RESUME_AUTOSAVE_MIN_DELAY_MS,
    Math.min(RESUME_AUTOSAVE_DEBOUNCE_MS, RESUME_AUTOSAVE_MAX_WAIT_MS - elapsedSinceStreakStart)
  );
}
