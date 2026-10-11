import React from 'react';
import type { Experience } from '@/components/dashboard/resume-component';
import { formatDateRange } from '@/lib/utils';
import { RESUME_SECTION_TITLE } from './page-break-attrs';
import baseStyles from './styles/_base.module.css';

/** Fallback for "Earlier experience" when a caller passes no translated label. */
export const DEFAULT_EARLIER_EXPERIENCE_LABEL = 'Earlier experience';

/** Split work experience into full entries and condensed (old) roles, keeping order. */
export function splitCondensed(entries: readonly Experience[] | null | undefined): {
  full: Experience[];
  condensed: Experience[];
} {
  const list = entries ?? [];
  return {
    full: list.filter((entry) => !entry.condensed),
    condensed: list.filter((entry) => entry.condensed),
  };
}

/** "Title, Company, Years": the order the ATS round trip expects for a condensed role. */
export function condensedLine(entry: Experience): string {
  return [entry.title, entry.company, entry.years ? formatDateRange(entry.years) : undefined]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

interface EarlierExperienceProps {
  items: readonly Experience[];
  label?: string;
}

/**
 * Condensed old roles, one line each, under an "Earlier experience" subheading.
 * Rendered after a template's full experience entries; bullets are not shown.
 * Server-safe (no hooks): the print route renders templates as server components.
 */
export function EarlierExperience({ items, label }: EarlierExperienceProps) {
  const lines = items.map((entry) => ({ id: entry.id, text: condensedLine(entry) }));
  if (!lines.some((line) => line.text)) return null;
  return (
    <div className={baseStyles['resume-item']} data-earlier-experience="">
      <p {...RESUME_SECTION_TITLE} className={baseStyles['resume-item-title']}>
        {label || DEFAULT_EARLIER_EXPERIENCE_LABEL}
      </p>
      <ul className="list-none p-0 m-0">
        {lines
          .filter((line) => line.text)
          .map((line) => (
            <li key={line.id} className={baseStyles['resume-text']}>
              {line.text}
            </li>
          ))}
      </ul>
    </div>
  );
}
