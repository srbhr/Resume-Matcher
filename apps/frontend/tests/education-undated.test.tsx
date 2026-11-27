import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { EducationForm } from '@/components/builder/forms/education-form';
import { ResumeSingleColumn } from '@/components/resume/resume-single-column';
import { ResumeTwoColumn } from '@/components/resume/resume-two-column';
import { ResumeModern } from '@/components/resume/resume-modern';
import { ResumeModernTwoColumn } from '@/components/resume/resume-modern-two-column';
import { ResumeLatex } from '@/components/resume/resume-latex';
import { ResumeClean } from '@/components/resume/resume-clean';
import { ResumeVivid } from '@/components/resume/resume-vivid';
import { ResumeVividSingle } from '@/components/resume/resume-vivid-single';
import { ResumeModernDeedy } from '@/components/resume/resume-modern-deedy';
import { ResumeDeedy } from '@/components/resume/resume-deedy';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

/**
 * Degree dates are optional: many people leave them out on purpose. Every
 * template prints an undated degree cleanly, and the editor says the field may
 * stay empty. The templates are imported directly (the Resume wrapper loads them
 * lazily).
 */
const data: ResumeData = {
  personalInfo: { name: 'Sam Lee', email: 'sam@example.com' },
  workExperience: [
    { id: 1, title: 'Engineer', company: 'Acme', years: '2020 - 2022', description: ['Built it.'] },
  ],
  education: [{ id: 1, institution: 'State University', degree: 'BSc Physics', years: '' }],
};

const TEMPLATES: Record<string, ComponentType<{ data: ResumeData }>> = {
  ResumeSingleColumn,
  ResumeTwoColumn,
  ResumeModern,
  ResumeModernTwoColumn,
  ResumeLatex,
  ResumeClean,
  ResumeVivid,
  ResumeVividSingle,
  ResumeModernDeedy,
  ResumeDeedy,
};

describe('a degree without dates', () => {
  it.each(Object.entries(TEMPLATES))('prints cleanly in %s', (_name, Template) => {
    const { container } = render(<Template data={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('State University');
    expect(text).toContain('BSc Physics');
    expect(text).not.toMatch(/undefined|null|NaN/);
    // No dangling range separator or empty brackets where the dates would be.
    expect(text).not.toMatch(/State University\s*[-–—,(]\s*$|\(\s*\)/m);
  });

  it('is marked optional in the editor', () => {
    render(
      <EducationForm
        data={[{ id: 1, institution: 'State University', degree: 'BSc', years: '' }]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/builder\.genericItemForm\.fields\.years/)).toHaveAccessibleName(
      'builder.genericItemForm.fields.years (common.optional)'
    );
  });
});
