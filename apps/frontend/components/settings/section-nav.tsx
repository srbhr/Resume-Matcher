'use client';

import React, { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export const SETTINGS_SECTIONS = ['llm', 'content', 'language', 'danger', 'about'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const isSection = (value: string | null | undefined): value is SettingsSection =>
  (SETTINGS_SECTIONS as readonly string[]).includes(value ?? '');

/**
 * Opens the section named by `?section=` (a link from elsewhere in the app or an
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
