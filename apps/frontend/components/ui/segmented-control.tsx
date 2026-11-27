'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedItem<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
  /** A caption for a run of options. Consecutive items with the same group share one. */
  group?: string;
}

export interface SegmentedControlProps<T extends string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * fill: selected = ink fill (text options). tile: a white tile with no padding of its
   * own, whose label shows the selection itself (the template tiles' ink name band).
   */
  variant?: 'fill' | 'tile';
  size?: 'sm' | 'default';
  className?: string;
  /** With grouped items: the layout of each group's options (className lays out the groups). */
  groupClassName?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/** Single-select segmented control with radiogroup semantics and arrow-key navigation. */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  variant = 'fill',
  size = 'default',
  className,
  groupClassName,
  ...aria
}: SegmentedControlProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.disabled);
  // A disabled button cannot take focus, so a disabled selection hands the tab stop to the
  // first enabled option instead of leaving the group unreachable by keyboard.
  const selectedIndex = items.findIndex((item) => item.value === value && !item.disabled);
  const tabStop = selectedIndex >= 0 ? selectedIndex : (enabled[0]?.index ?? -1);

  const move = (from: number, delta: number) => {
    const pos = enabled.findIndex(({ index }) => index === from);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.item.value);
    refs.current[next.index]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(index, 1);
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(index, -1);
    }
    if (event.key === 'Home' && enabled[0]) {
      event.preventDefault();
      move(enabled[0].index, 0);
    }
    if (event.key === 'End' && enabled.length) {
      event.preventDefault();
      move(enabled[enabled.length - 1].index, 0);
    }
  };

  const renderItem = (item: SegmentedItem<T>, index: number) => {
    const selected = item.value === value;
    return (
      <button
        key={item.value}
        ref={(el) => {
          refs.current[index] = el;
        }}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={index === tabStop ? 0 : -1}
        disabled={item.disabled}
        title={item.title}
        onClick={() => onChange(item.value)}
        onKeyDown={(event) => onKeyDown(event, index)}
        className={cn(
          'rounded-none border border-ink font-mono uppercase tracking-wider transition-colors',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'min-h-8 px-3 text-xs' : 'min-h-10 px-4 text-sm',
          variant === 'tile' && 'px-0',
          variant === 'fill' &&
            (selected ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-panel'),
          variant === 'tile' &&
            cn('overflow-hidden bg-white p-0 text-ink', !selected && 'hover:bg-panel')
        )}
      >
        {item.label}
      </button>
    );
  };

  // Grouped items: one radiogroup (the arrow keys still run through every option), with a
  // caption over each run of options that share a group.
  if (items.some((item) => item.group)) {
    const groups: Array<{ label: string; entries: Array<[SegmentedItem<T>, number]> }> = [];
    items.forEach((item, index) => {
      const label = item.group ?? '';
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.entries.push([item, index]);
      else groups.push({ label, entries: [[item, index]] });
    });
    return (
      <div role="radiogroup" {...aria} className={cn('space-y-4', className)}>
        {groups.map((group) => (
          // A caption can repeat in another run; the run's first item can't.
          <div key={String(group.entries[0][0].value)} className="space-y-2">
            {group.label && (
              <p className="font-mono text-xs uppercase tracking-wider text-steel">{group.label}</p>
            )}
            <div className={cn('flex flex-wrap gap-2', groupClassName)}>
              {group.entries.map(([item, index]) => renderItem(item, index))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div role="radiogroup" {...aria} className={cn('flex flex-wrap gap-2', className)}>
      {items.map((item, index) => renderItem(item, index))}
    </div>
  );
}
