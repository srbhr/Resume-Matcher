'use client';

import React, { useId, useState } from 'react';
import { CaretDown, Copy, Trash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface EntryCardProps {
  /** The entry's name (job title, school, project); empty shows "Untitled entry". */
  title: string;
  /** One line shown beside the title while collapsed, like "Acme · 2021 - 2024". */
  summary?: string;
  /** The row's drag handle, from SortableItemList's `handleInside`. */
  handle?: React.ReactNode;
  onDuplicate: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}

/**
 * One entry of a list section (experience, education, projects, custom items).
 * A header row carries the drag handle, the entry's name, Duplicate and Delete,
 * and folds the entry to that one row; the fields below use the full width.
 */
export function EntryCard({
  title,
  summary,
  handle,
  onDuplicate,
  onRemove,
  children,
}: EntryCardProps) {
  const { t } = useTranslations();
  const bodyId = useId();
  const [open, setOpen] = useState(true);
  const name = title.trim() || t('builder.entry.untitled');

  return (
    <div className="border border-ink bg-white">
      <div
        className={cn(
          'flex items-center gap-1 bg-paper py-1 pl-1 pr-2',
          open && 'border-b border-ink'
        )}
      >
        {handle}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={t(open ? 'builder.entry.collapse' : 'builder.entry.expand', { item: name })}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <CaretDown
            aria-hidden="true"
            className={cn(
              'size-4 shrink-0 text-ink-soft transition-transform',
              !open && '-rotate-90'
            )}
          />
          <span
            className={cn(
              'min-w-0 truncate text-sm font-semibold',
              title.trim() ? 'text-ink' : 'text-steel'
            )}
          >
            {name}
          </span>
          {!open && summary && (
            <span className="min-w-0 truncate font-mono text-xs text-steel">{summary}</span>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-ink-soft hover:text-ink"
          onClick={onDuplicate}
          aria-label={t('a11y.duplicateItem')}
          title={t('a11y.duplicateItem')}
        >
          <Copy aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-ink-soft hover:bg-destructive-tint hover:text-destructive"
          onClick={onRemove}
          aria-label={t('a11y.removeItem')}
          title={t('a11y.removeItem')}
        >
          <Trash aria-hidden="true" />
        </Button>
      </div>
      <div id={bodyId} hidden={!open} className="space-y-6 p-4">
        {children}
      </div>
    </div>
  );
}

/** "Acme · 2021 - 2024": the non-empty parts, for an entry's collapsed row. */
export function entrySummary(...parts: Array<string | undefined | null>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ');
}
