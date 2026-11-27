'use client';

import './ui-sdk.css';
import type { ReactNode } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandList,
} from '@ui-sdk/react/command';
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/react/dialog';

export interface PaletteCommand {
  /** What `onRun` receives; unique across the palette. */
  value: string;
  label: string;
  icon?: ReactNode;
  /** More words the search matches, like a resume's file name. */
  keywords?: string[];
  /** Quiet text at the end of the row, like "Master". */
  hint?: string;
}

export interface PaletteGroup {
  label: string;
  commands: PaletteCommand[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dialog's accessible name and the search field's. */
  title: string;
  placeholder: string;
  emptyText: string;
  groups: PaletteGroup[];
  /** Runs after the palette closes, with the chosen command's value. */
  onRun: (value: string) => void;
  footer?: ReactNode;
}

/**
 * A Swiss command palette: ui-sdk's Command in its Dialog. Type to narrow,
 * arrows to move, Enter to run, Escape to close. Square, ink-bordered, hard
 * shadow; the highlighted row fills ink (selection is ink). It snaps open.
 */
export function CommandPalette({
  open,
  onOpenChange,
  title,
  placeholder,
  emptyText,
  groups,
  onRun,
  footer,
}: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop />
      <DialogContent className="mt-[15vh] mb-auto w-[min(40rem,calc(100%-2rem))] gap-0 overflow-hidden border border-ink bg-white p-0 shadow-sw-lg">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command
          loop
          className="w-full border-0 bg-transparent"
          onAction={(value) => {
            onOpenChange(false);
            onRun(value);
          }}
        >
          <div className="flex items-center gap-3 border-b border-ink px-4">
            <MagnifyingGlass aria-hidden="true" className="size-5 shrink-0 text-ink" />
            <CommandInput
              aria-label={title}
              placeholder={placeholder}
              className="h-14 w-full border-0 bg-transparent px-0 text-base text-ink shadow-none outline-none placeholder:text-steel focus-visible:outline-none"
            />
          </div>
          <CommandEmpty className="px-4 py-6 text-sm text-ink-soft empty:hidden">
            {emptyText}
          </CommandEmpty>
          <CommandList className="max-h-[min(24rem,55vh)] overflow-y-auto py-2">
            {groups
              .filter((group) => group.commands.length > 0)
              .map((group) => (
                <CommandGroup key={group.label} className="py-1">
                  <CommandGroupLabel className="px-4 pt-2 pb-1 font-mono text-xs font-bold uppercase tracking-wide text-steel">
                    {group.label}
                  </CommandGroupLabel>
                  {group.commands.map((command) => (
                    <CommandItem
                      key={command.value}
                      value={command.value}
                      label={command.label}
                      keywords={command.keywords}
                      className="flex h-auto cursor-pointer items-center gap-3 px-4 py-2 text-sm text-ink data-highlighted:bg-ink data-highlighted:text-white"
                    >
                      {command.icon && (
                        <CommandItemIcon className="flex size-4 shrink-0 items-center justify-center">
                          {command.icon}
                        </CommandItemIcon>
                      )}
                      <span className="min-w-0 truncate">{command.label}</span>
                      {command.hint && (
                        <span className="ml-auto shrink-0 font-mono text-xs uppercase">
                          {command.hint}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
          {footer}
        </Command>
      </DialogContent>
    </Dialog>
  );
}
