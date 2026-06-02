import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdditionalForm } from '@/components/builder/forms/additional-form';
import { ResumeSingleColumn } from '@/components/resume/resume-single-column';
import type {
  AdditionalInfo,
  ResumeData,
} from '@/components/dashboard/resume-component';

// Components call useTranslations(); return the key so we can match deterministically.
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

describe('AdditionalForm newline handling (issue #763)', () => {
  it('preserves a trailing blank line so Enter can create a new item', () => {
    const onChange = vi.fn<(data: AdditionalInfo) => void>();
    const data: AdditionalInfo = { technicalSkills: ['React'] };

    render(<AdditionalForm data={data} onChange={onChange} />);

    const textarea = screen.getByLabelText('resume.additional.technicalSkills');
    // Simulate pressing Enter at the end of "React": the value now has a trailing
    // newline (an empty line). Before the fix this empty line was filtered out on
    // every keystroke, so the newline never survived a re-render.
    fireEvent.change(textarea, { target: { value: 'React\n' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].technicalSkills).toEqual(['React', '']);
  });

  it('preserves a blank line between two items', () => {
    const onChange = vi.fn<(data: AdditionalInfo) => void>();
    const data: AdditionalInfo = {};

    render(<AdditionalForm data={data} onChange={onChange} />);

    const textarea = screen.getByLabelText('resume.additional.technicalSkills');
    fireEvent.change(textarea, { target: { value: 'React\n\nTypeScript' } });

    expect(onChange.mock.calls[0][0].technicalSkills).toEqual([
      'React',
      '',
      'TypeScript',
    ]);
  });
});

describe('ResumeSingleColumn filters blank entries (issue #763)', () => {
  it('does not render empty/whitespace-only additional entries', () => {
    const data: ResumeData = {
      personalInfo: { name: 'Jane Doe' },
      additional: {
        technicalSkills: ['React', '', '   ', 'TypeScript'],
      },
    } as ResumeData;

    render(<ResumeSingleColumn data={data} />);

    // Blank entries must not produce stray separators in the joined output.
    expect(screen.getByText('React, TypeScript')).toBeInTheDocument();
    expect(screen.queryByText(/React, , /)).not.toBeInTheDocument();
  });
});
