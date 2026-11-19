import type { KeyboardEvent } from 'react';

/**
 * Whether this keydown belongs to an IME composition (Chinese, Japanese, Korean
 * input). There Enter confirms a conversion candidate and Escape cancels it, so a
 * handler must not treat either as submit or cancel. Safari clears `isComposing`
 * before the confirming keydown reaches script, but still reports keyCode 229.
 */
export function isImeComposing(event: KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}
