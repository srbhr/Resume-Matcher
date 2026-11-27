'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { isImeComposing } from '@/lib/utils/keyboard';

/** A button anywhere can open the palette by dispatching this event on window. */
export const OPEN_COMMAND_PALETTE = 'resume-matcher:open-command-palette';

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE));
}

// The palette (ui-sdk's Dialog and Command, about 50 KB gzip) loads on its first
// use, so it costs no page anything until someone presses Cmd+K or Ctrl+K.
const CommandPaletteContent = dynamic(
  () => import('./command-palette-content').then((m) => m.CommandPaletteContent),
  { ssr: false }
);

/**
 * Cmd+K (Ctrl+K elsewhere) opens the command palette from any page in the
 * (default) layout. It listens on window, after document, so a handler that
 * already used the keys wins: the rich-text editor's Ctrl+K inserts a link.
 */
export function CommandPaletteLauncher() {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isImeComposing(event)) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setUsed(true);
      setOpen((wasOpen) => !wasOpen);
    };
    const onOpen = () => {
      setUsed(true);
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE, onOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE, onOpen);
    };
  }, []);

  if (!used) return null;
  return <CommandPaletteContent open={open} onOpenChange={setOpen} />;
}
