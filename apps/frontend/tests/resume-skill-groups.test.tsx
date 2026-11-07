import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import Resume, { type ResumeData } from '@/components/dashboard/resume-component';
import { TEMPLATE_OPTIONS } from '@/lib/types/template-settings';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

/**
 * Grouped technical skills (Jochuan's request): "Label: a, b" lines and "---"
 * breaks lay skills out in rows, one per group, in every template. The marker
 * itself never reaches the page, and the text (what an ATS reads) keeps the
 * label in front of its skills.
 */

const GROUPED = [
  'Molecular Biology: PCR, qPCR, RT-PCR',
  'Bioinformatics: Python, análise filogenética (MEGA, BLAST)',
  '---',
  'Excel',
  'Power Query',
  '---',
  'Lab safety',
];

const data = {
  personalInfo: { name: 'Ana Souza' },
  additional: { technicalSkills: GROUPED },
} as ResumeData;

/** The deepest element whose text holds both strings: the row they share. */
function rowOf(container: HTMLElement, first: string, last: string): Element {
  const matches = Array.from(container.querySelectorAll('*')).filter(
    (el) => el.textContent?.includes(first) && el.textContent.includes(last)
  );
  return matches[matches.length - 1];
}

describe.each(TEMPLATE_OPTIONS.map((option) => option.id))('%s skill groups', (template) => {
  it('never shows the "---" marker', () => {
    const { container } = render(<Resume resumeData={data} template={template} />);
    expect(container.textContent).not.toContain('---');
  });

  it('puts each group on its own row, label first', () => {
    const { container } = render(<Resume resumeData={data} template={template} />);

    const biology = rowOf(container, 'Molecular Biology:', 'RT-PCR');
    expect(biology.textContent).toMatch(/Molecular Biology:\s*PCR/);
    expect(biology.textContent).not.toContain('Bioinformatics');

    const bioinformatics = rowOf(container, 'Bioinformatics:', 'análise filogenética');
    expect(bioinformatics.textContent).toContain('análise filogenética (MEGA, BLAST)');
    expect(bioinformatics.textContent).not.toContain('Excel');

    const unlabeled = rowOf(container, 'Excel', 'Power Query');
    expect(unlabeled.textContent).not.toContain('Lab safety');
    expect(unlabeled.textContent).not.toContain('Python');
  });
});
