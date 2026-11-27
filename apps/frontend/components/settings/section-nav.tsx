'use client';

import React, { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export const SETTINGS_SECTIONS = ['llm', 'content', 'language', 'danger', 'about'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const isSection = (value: string | null | undefined): value is SettingsSection =>
  (SETTINGS_SECTIONS as readonly string[]).includes(value ?? '');

export interface SectionNavItem {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
}

/**
 * The Settings section rail: one button per section, the open one an ink fill.
 * A column at the left from md up; a ruled row of tabs above the pane below it.
 */
export function SectionNav({
  items,
  active,
  label,
  onSelect,
}: {
  items: SectionNavItem[];
  active: SettingsSection;
  label: string;
  onSelect: (section: SettingsSection) => void;
}) {
  return (
    <nav
      aria-label={label}
      className="flex shrink-0 gap-px overflow-x-auto border-b border-ink bg-ink md:w-56 md:flex-col md:overflow-y-auto md:border-r md:border-b-0 md:bg-canvas"
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={selected ? 'true' : undefined}
            onClick={() => onSelect(item.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-3 text-left font-mono text-xs uppercase tracking-wider transition-colors md:border-b md:border-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
              selected ? 'bg-ink text-white' : 'bg-canvas text-ink hover:bg-panel'
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Opens the section named by `?section=` (a link from the command palette or an
 * alert). Render it inside a Suspense boundary: it reads the search params.
 */
export function SectionFromUrl({ onSection }: { onSection: (section: SettingsSection) => void }) {
  const section = useSearchParams()?.get('section');

  useEffect(() => {
    if (isSection(section)) onSection(section);
  }, [section, onSection]);

  return null;
}

/** Keep the open section in the URL without a navigation, so it can be linked to. */
export function writeSectionToUrl(section: SettingsSection) {
  const url = new URL(window.location.href);
  url.searchParams.set('section', section);
  window.history.replaceState(window.history.state, '', url);
}
