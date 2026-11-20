import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Whether this keydown belongs to an IME composition (Chinese, Japanese, Korean
 * input). There Enter confirms a conversion candidate and Escape cancels it, so a
 * handler must not treat either as submit or cancel. Safari clears `isComposing`
 * before the confirming keydown reaches script, but still reports keyCode 229.
 * Takes React's event or the DOM's (a document listener gets the DOM's).
 */
export function isImeComposing(event: ReactKeyboardEvent | KeyboardEvent): boolean {
  const native = 'nativeEvent' in event ? event.nativeEvent : event;
  return native.isComposing || event.keyCode === 229;
}
