import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GenericListForm } from '@/components/builder/forms/generic-list-form';
import { DynamicResumeSection } from '@/components/resume/dynamic-resume-section';
import type { ResumeData, SectionMeta } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

describe('GenericListForm newline editing', () => {
  it('keeps the trailing empty item when Enter starts a new line', () => {
    const onChange = vi.fn<(items: string[]) => void>();
    render(<GenericListForm items={['React']} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'React\n' } });

    expect(onChange).toHaveBeenCalledWith(['React', '']);
  });

  it('hides blank editing entries in the preview', () => {
    const sectionMeta: SectionMeta = {
      id: 'skills',
      key: 'skills',
      displayName: 'Skills',
      sectionType: 'stringList',
      isDefault: false,
      isVisible: true,
      order: 0,
    };
    const resumeData: ResumeData = {
      customSections: {
        skills: { sectionType: 'stringList', strings: ['React', '', '  ', 'TypeScript'] },
      },
    };

    const { rerender } = render(
      <DynamicResumeSection sectionMeta={sectionMeta} resumeData={resumeData} />
    );
    expect(screen.getByText('React, TypeScript')).toBeInTheDocument();

    rerender(
      <DynamicResumeSection
        sectionMeta={sectionMeta}
        resumeData={{
          customSections: { skills: { sectionType: 'stringList', strings: ['', '  '] } },
        }}
      />
    );
    expect(screen.queryByText('Skills')).not.toBeInTheDocument();
  });
});
