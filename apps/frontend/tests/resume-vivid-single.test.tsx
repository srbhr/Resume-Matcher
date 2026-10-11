import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Resume, { type ResumeData, type SectionMeta } from '@/components/dashboard/resume-component';
import { ResumeVividSingle } from '@/components/resume/resume-vivid-single';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

const meta = (id: string, order: number, patch: Partial<SectionMeta> = {}): SectionMeta => ({
  id,
  key: id,
  displayName: id,
  sectionType: 'itemList',
  isDefault: !id.startsWith('custom_'),
  isVisible: true,
  order,
  ...patch,
});

const data: ResumeData = {
  personalInfo: {
    name: 'Sarah Chen',
    title: 'Staff Engineer',
    email: 'sarah@example.com',
    linkedin: 'linkedin.com/in/sarah',
    github: 'github.com/sarah',
  },
  summary: 'Builds retrieval pipelines.',
  workExperience: [
    {
      id: 1,
      title: 'Staff Engineer',
      company: 'Fernway',
      years: '2020 - 2023',
      location: 'Berlin',
    },
  ],
  education: [{ id: 1, institution: 'Uni Berlin', degree: 'BSc Physics', years: '2012 - 2016' }],
  personalProjects: [{ id: 1, name: 'promptdiff', description: ['A prompt test runner.'] }],
  additional: {
    technicalSkills: ['Python', ' ', 'Go'],
    languages: ['English', 'German'],
    certificationsTraining: ['AWS SA'],
    awards: ['Best Paper'],
  },
  sectionMeta: [
    meta('personalInfo', 0, { sectionType: 'personalInfo' }),
    meta('education', 1, { displayName: 'Education' }),
    meta('workExperience', 2, { displayName: 'Experience' }),
    meta('custom_1', 3, { sectionType: 'text', displayName: 'Volunteering' }),
    meta('personalProjects', 4, { displayName: 'Projects', isVisible: false }),
    meta('additional', 5, { sectionType: 'stringList' }),
    meta('summary', 6, { sectionType: 'text', displayName: 'Profile' }),
  ],
  customSections: { custom_1: { sectionType: 'text', text: 'Mentors engineers.' } },
} as ResumeData;

const headingTexts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);

describe('ResumeVividSingle', () => {
  it('splits the name into two tones and renders the entry, role and meta', () => {
    render(<ResumeVividSingle data={data} />);
    expect(screen.getByText('Sarah')).toBeInTheDocument();
    expect(screen.getByText('Chen')).toBeInTheDocument();
    expect(screen.getByText('Fernway')).toBeInTheDocument();
    expect(screen.getByText('Staff Engineer', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('2020 - 2023 | Berlin')).toBeInTheDocument();
  });

  it('flows every visible section in sectionMeta order, in one column', () => {
    const { container } = render(<ResumeVividSingle data={data} />);
    expect(headingTexts(container)).toEqual([
      'Education',
      'Experience',
      'Volunteering',
      'Skills',
      'Languages',
      'Training & Certifications',
      'Awards',
      'Profile',
      'Links',
    ]);
    expect(screen.getByText('Mentors engineers.')).toBeInTheDocument();
  });

  it('omits hidden sections and their content', () => {
    render(<ResumeVividSingle data={data} />);
    expect(screen.queryByText('promptdiff')).not.toBeInTheDocument();
  });

  it('moves the sidebar content into the flow: skills carry a text separator', () => {
    render(<ResumeVividSingle data={data} />);
    expect(screen.getByText('Python • Go')).toBeInTheDocument();
    expect(screen.getByText('English • German')).toBeInTheDocument();
    expect(screen.getByText('AWS SA')).toBeInTheDocument();
    expect(screen.getByText('Best Paper')).toBeInTheDocument();
  });

  it('shows education as an entry with institution, degree and years', () => {
    render(<ResumeVividSingle data={data} />);
    expect(screen.getByText('Uni Berlin')).toBeInTheDocument();
    expect(screen.getByText('BSc Physics')).toBeInTheDocument();
    expect(screen.getByText('2012 - 2016')).toBeInTheDocument();
  });

  it('uses the section headings it is given', () => {
    render(
      <ResumeVividSingle
        data={{ ...data, sectionMeta: undefined }}
        sectionHeadings={{ skills: 'Fertigkeiten', links: 'Verweise' }}
      />
    );
    expect(screen.getByText('Fertigkeiten')).toBeInTheDocument();
    expect(screen.getByText('Verweise')).toBeInTheDocument();
  });

  it('is the layout the Resume wrapper picks for the vivid-single template', () => {
    render(<Resume resumeData={data} template="vivid-single" />);
    expect(screen.getByText('Python • Go')).toBeInTheDocument();
  });
});
