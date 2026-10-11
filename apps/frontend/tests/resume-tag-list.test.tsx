import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { ResumeData } from '@/components/dashboard/resume-component';

import { ResumeModern } from '@/components/resume/resume-modern';
import { ResumeSingleColumn } from '@/components/resume/resume-single-column';
import baseStyles from '@/components/resume/styles/_base.module.css';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

/**
 * #875: Swiss Single Column and Modern render skills, languages, certifications
 * and awards as tags. The tags must stay separate items on the page while the
 * text (copy/paste, screen readers, the PDF text layer an ATS reads) keeps
 * "Python, Machine Learning, Go" rather than running the items together.
 */

const ADDITIONAL = {
  technicalSkills: ['Python', 'Machine Learning', 'Go'],
  languages: ['English (Native)', 'German (B2)'],
  certificationsTraining: ['AWS Certified Solutions Architect'],
  awards: ["Dean's List 2019", 'HackMIT Winner'],
};

const data = { personalInfo: { name: 'Jane Doe' }, additional: ADDITIONAL } as ResumeData;

const TEMPLATES: [string, React.ComponentType<{ data: ResumeData }>][] = [
  ['ResumeSingleColumn', ResumeSingleColumn],
  ['ResumeModern', ResumeModern],
];

describe.each(TEMPLATES)('%s additional info tags', (_name, Template) => {
  it('renders every item of all four fields as its own tag', () => {
    render(<Template data={data} />);

    for (const item of Object.values(ADDITIONAL).flat()) {
      const tag = screen.getByText(item);
      expect(tag).toHaveClass(baseStyles['resume-skill-pill']);
      expect(tag.textContent).toBe(item);
    }
  });

  it('keeps ", " between tags in the text, with none trailing', () => {
    render(<Template data={data} />);

    for (const items of Object.values(ADDITIONAL)) {
      const tagList = screen.getByText(items[0]).parentElement;
      expect(tagList).toHaveClass(baseStyles['resume-tag-list']);
      expect(tagList?.textContent).toBe(items.join(', '));
    }
  });
});

describe('tag separator style', () => {
  const css = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../components/resume/styles/_base.module.css'
    ),
    'utf-8'
  );
  const rule = css.match(/\.resume-tag-separator\s*\{([^}]*)\}/)?.[1] ?? '';

  it('hides the comma with a transparent colour, which Chromium keeps in the PDF', () => {
    expect(rule).toMatch(/color:\s*transparent/);
    // Each of these drops the glyph from Chromium's PDF output, so an ATS
    // would read "Python Machine Learning Go" with no item boundaries.
    expect(rule).not.toMatch(/display:\s*none|visibility:\s*hidden|opacity:\s*0|font-size:\s*0/);
    expect(rule).not.toMatch(/position:\s*absolute|clip|overflow:\s*hidden|width:\s*0/);
  });
});
