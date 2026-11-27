'use client';

import './ui-sdk.css';
import * as React from 'react';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@ui-sdk/react/tabs';
import { cn } from '@/lib/utils';

/** Whether a media query matches; false on the server and during hydration. */
function useMatches(query: string | undefined): boolean {
  return React.useSyncExternalStore(
    (notify) => {
      if (!query) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => (query ? window.matchMedia(query).matches : false),
    () => false
  );
}

/**
 * A side menu that switches the panel beside it: ui-sdk's vertical Tabs (tab
 * semantics, Up and Down Arrow between items, Home and End), in the Swiss look.
 * The selected item is an ink fill; the others are quiet until hovered. Lay the
 * list and the panels out with `className`; panels unmount when not selected.
 *
 * A page that lays the list out as a row on smaller screens passes the media query
 * from which it is a column as `verticalFrom`; below it the tabs are horizontal, so
 * Left and Right Arrow move between them and the orientation announced matches.
 */
export function SideTabs<T extends string>({
  value,
  onValueChange,
  verticalFrom,
  className,
  children,
}: {
  value: T;
  onValueChange: (value: T) => void;
  verticalFrom?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const wide = useMatches(verticalFrom);
  return (
    <Tabs
      orientation={!verticalFrom || wide ? 'vertical' : 'horizontal'}
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      className={cn('border-0 bg-transparent p-0', className)}
    >
      {children}
    </Tabs>
  );
}

export function SideTabsList({
  label,
  className,
  children,
}: {
  /** The menu's accessible name. */
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TabsList
      aria-label={label}
      // ui-sdk's stylesheet makes a vertical list a column; state the direction here so
      // a caller's responsive row (flex-row xl:flex-col) is never overridden by it.
      className={cn('flex flex-col gap-1 border-0 bg-transparent p-0 shadow-none', className)}
    >
      {children}
    </TabsList>
  );
}

export function SideTab({
  value,
  icon,
  className,
  children,
}: {
  value: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TabsTab
      value={value}
      className={cn(
        'flex h-10 shrink-0 items-center gap-3 whitespace-nowrap border-0 bg-transparent px-3 text-left font-sans text-sm text-ink-soft shadow-none transition-colors',
        'hover:bg-panel hover:text-ink',
        'data-selected:bg-ink data-selected:font-semibold data-selected:text-white data-selected:hover:bg-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        className
      )}
    >
      {icon}
      {children}
    </TabsTab>
  );
}

export function SideTabsPanel({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TabsPanel value={value} className={cn('p-0 outline-none', className)}>
      {children}
    </TabsPanel>
  );
}
