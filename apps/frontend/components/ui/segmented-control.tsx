'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedItem<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** fill: selected = ink fill (text options). outline: selected = 2px ink outline (thumbnails). */
  variant?: 'fill' | 'outline';
  size?: 'sm' | 'default';
  className?: string;
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
  ...aria
}: SegmentedControlProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.disabled);
  const selectedIndex = items.findIndex((item) => item.value === value);
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

  return (
    <div role="radiogroup" {...aria} className={cn('flex flex-wrap gap-2', className)}>
      {items.map((item, index) => {
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
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              'disabled:cursor-not-allowed disabled:opacity-50',
              size === 'sm' ? 'min-h-8 px-3 text-xs' : 'min-h-10 px-4 text-sm',
              variant === 'fill' &&
                (selected ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-panel'),
              variant === 'outline' &&
                cn(
                  'bg-white p-2 text-ink',
                  selected ? 'outline-2 outline-offset-2 outline-ink' : 'hover:bg-panel'
                )
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
