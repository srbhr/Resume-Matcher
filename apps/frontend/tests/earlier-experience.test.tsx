import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  EarlierExperience,
  condensedLine,
  splitCondensed,
} from '@/components/resume/earlier-experience';
import Resume, { type ResumeData } from '@/components/dashboard/resume-component';
import { TEMPLATE_OPTIONS } from '@/lib/types/template-settings';
import { ExperienceForm } from '@/components/builder/forms/experience-form';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

const jobs = [
  {
    id: 1,
    title: 'Staff Engineer',
    company: 'Northwind',
    years: '2018 - Present',
    description: ['Led the platform team'],
  },
  {
    id: 2,
    title: 'Junior Developer',
    company: 'Contoso',
    years: '2004 - 2006',
    description: ['Hidden bullet for a condensed role'],
    condensed: true,
  },
];

describe('splitCondensed / condensedLine', () => {
  it('splits by the condensed flag and keeps order', () => {
    const { full, condensed } = splitCondensed(jobs);
    expect(full.map((j) => j.id)).toEqual([1]);
    expect(condensed.map((j) => j.id)).toEqual([2]);
    expect(splitCondensed(undefined)).toEqual({ full: [], condensed: [] });
  });

  it('renders title, company, years in that order (the ATS round-trip order)', () => {
    expect(condensedLine(jobs[1])).toMatch(/^Junior Developer, Contoso, 2004/);
    expect(condensedLine({ id: 3, title: 'Intern' })).toBe('Intern');
  });
});

describe('EarlierExperience', () => {
  it('shows the label and one line per condensed role, without bullets', () => {
    render(<EarlierExperience items={[jobs[1]]} label="Earlier experience" />);
    expect(screen.getByText('Earlier experience')).toBeInTheDocument();
    expect(screen.getByText(/Junior Developer, Contoso, 2004/)).toBeInTheDocument();
    expect(screen.queryByText('Hidden bullet for a condensed role')).toBeNull();
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<EarlierExperience items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('every template renders condensed roles as one-liners', () => {
  const data: ResumeData = {
    personalInfo: { name: 'Sarah Chen' },
    workExperience: jobs,
  } as ResumeData;

  it.each(TEMPLATE_OPTIONS.map((o) => o.id))('%s', (template) => {
    const { container, unmount } = render(
      <Resume
        resumeData={data}
        template={template}
        sectionHeadings={{ earlierExperience: 'Earlier experience' }}
      />
    );
    expect(container.textContent).toContain('Staff Engineer');
    expect(container.textContent).toContain('Earlier experience');
    expect(container.textContent).toMatch(/Junior Developer, Contoso, 2004/);
    expect(container.textContent).not.toContain('Hidden bullet for a condensed role');
    unmount();
  });
});

describe('ExperienceForm condense toggle', () => {
  it('sets condensed on the entry', () => {
    const onChange = vi.fn();
    render(<ExperienceForm data={[{ ...jobs[0] }]} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole('switch', { name: /builder.forms.experience.condense.label/ })
    );
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 1, condensed: true })]);
  });
});
