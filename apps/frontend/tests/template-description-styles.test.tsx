import { describe, expect, it, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import React from 'react';
import type { ResumeData } from '@/components/dashboard/resume-component';

import { ResumeClean } from '@/components/resume/resume-clean';
import { ResumeLatex } from '@/components/resume/resume-latex';
import { ResumeModern } from '@/components/resume/resume-modern';
import { ResumeModernTwoColumn } from '@/components/resume/resume-modern-two-column';
import { ResumeSingleColumn } from '@/components/resume/resume-single-column';
import { ResumeTwoColumn } from '@/components/resume/resume-two-column';
import { ResumeVivid } from '@/components/resume/resume-vivid';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

/**
 * T-03: every template threads `styles={exp.descriptionStyles}` into
 * DescriptionList, but nothing asserted it. Deleting that prop from any of the
 * seven files left the suite green while the template silently reverted to
 * all-bullets — the highest-risk regression in a 7-file copy-paste refactor.
 *
 * Markers are rendered in an aria-hidden span, so they are asserted through
 * textContent rather than by role.
 */

const buildData = (): ResumeData =>
  ({
    personalInfo: { name: 'Ada Lovelace', email: 'ada@example.com' },
    workExperience: [
      {
        id: 1,
        title: 'Engineer',
        company: 'Analytical Engines',
        location: 'London',
        years: '2024-Present',
        description: ['PLAIN ROW should have no marker', 'BULLET ROW should have one'],
        descriptionStyles: ['plain', 'bullet'],
      },
    ],
    additional: { technicalSkills: ['Ada'] },
  }) as ResumeData;

const TEMPLATES: [string, React.ComponentType<{ data: ResumeData }>][] = [
  ['ResumeClean', ResumeClean],
  ['ResumeLatex', ResumeLatex],
  ['ResumeModern', ResumeModern],
  ['ResumeModernTwoColumn', ResumeModernTwoColumn],
  ['ResumeSingleColumn', ResumeSingleColumn],
  ['ResumeTwoColumn', ResumeTwoColumn],
  ['ResumeVivid', ResumeVivid],
];

const rowFor = (container: HTMLElement, text: string): HTMLElement => {
  const node = within(container).getByText(text);
  const li = node.closest('li');
  if (!li) throw new Error(`no <li> ancestor for "${text}"`);
  return li as HTMLElement;
};

describe.each(TEMPLATES)('%s honours descriptionStyles', (_name, Template) => {
  it('renders a marker for bullet rows and none for plain rows', () => {
    const { container } = render(<Template data={buildData()} />);

    const plainRow = rowFor(container, 'PLAIN ROW should have no marker');
    const bulletRow = rowFor(container, 'BULLET ROW should have one');

    const markerIn = (li: HTMLElement) =>
      Array.from(li.querySelectorAll('[aria-hidden="true"]'))
        .map((n) => (n.textContent ?? '').trim())
        .filter(Boolean);

    // The bullet row carries a visible marker glyph; the plain row does not.
    expect(markerIn(bulletRow).length).toBeGreaterThan(0);
    expect(markerIn(plainRow)).toHaveLength(0);
  });

  it('defaults to bullets when descriptionStyles is absent (old resumes)', () => {
    const legacy = buildData();
    delete (legacy.workExperience![0] as { descriptionStyles?: unknown }).descriptionStyles;

    const { container } = render(<Template data={legacy} />);
    const row = rowFor(container, 'PLAIN ROW should have no marker');

    const markers = Array.from(row.querySelectorAll('[aria-hidden="true"]'))
      .map((n) => (n.textContent ?? '').trim())
      .filter(Boolean);

    expect(markers.length).toBeGreaterThan(0);
  });
});
