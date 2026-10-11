import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumeDeedy } from '@/components/resume/resume-deedy';
import type { ResumeData, SectionMeta } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

const meta = (
  key: string,
  displayName: string,
  order: number,
  extra: Partial<SectionMeta> = {}
): SectionMeta => ({
  id: key,
  key,
  displayName,
  sectionType: 'itemList',
  isDefault: !key.startsWith('custom'),
  isVisible: true,
  order,
  ...extra,
});

const buildData = (): ResumeData => ({
  personalInfo: {
    name: 'Ada King Lovelace',
    title: 'Analyst',
    email: 'ada@example.com',
    phone: '555-0100',
    location: 'London',
    website: 'ada.example.com',
    linkedin: 'https://www.linkedin.com/in/ada-lovelace/',
    github: 'github.com/ada',
  },
  summary: 'Hidden summary text.',
  workExperience: [
    {
      id: 1,
      title: 'Software Engineer',
      company: 'Analytical Engines',
      location: 'London',
      years: '2024 - Present',
      description: ['Wrote the first program.'],
    },
  ],
  education: [{ id: 1, institution: 'Somerville College', degree: 'BS in Mathematics' }],
  additional: {
    technicalSkills: ['Python', '', 'Go'],
    languages: ['English'],
    certificationsTraining: [],
    awards: ['2014 | top 52/2500 | KPCB Fellow', 'Excellence Award (2019)'],
  },
  sectionMeta: [
    meta('personalInfo', 'Personal Info', 0, { sectionType: 'personalInfo' }),
    meta('summary', 'Summary', 1, { sectionType: 'text', isVisible: false }),
    meta('workExperience', 'Experience', 2),
    meta('education', 'Education', 3),
    meta('additional', 'Skills & Awards', 4, { sectionType: 'stringList' }),
    meta('custom_1', 'Coursework', 5, { sectionType: 'stringList' }),
    meta('custom_2', 'Publications', 6, { sectionType: 'stringList' }),
  ],
  customSections: {
    custom_1: { sectionType: 'stringList', strings: ['Compilers'] },
    custom_2: { sectionType: 'stringList', strings: ['First paper.', 'Second paper.'] },
  },
});

const columns = (container: HTMLElement) => {
  const [left, right] = Array.from(container.querySelectorAll('[class*="sidebarColumn"]')).concat(
    Array.from(container.querySelectorAll('[class*="mainColumn"]'))
  );
  return { left: left.textContent ?? '', right: right.textContent ?? '' };
};

describe('ResumeDeedy', () => {
  it('splits the name into a thin first part and a heavier last name', () => {
    render(<ResumeDeedy data={buildData()} />);
    expect(screen.getByText('Ada King')).toBeInTheDocument();
    expect(screen.getByText('Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ada King Lovelace');
  });

  it('puts education, links, skills and coursework left; experience, awards and publications right', () => {
    const { container } = render(<ResumeDeedy data={buildData()} />);
    const { left, right } = columns(container);
    for (const text of ['Somerville College', 'LinkedIn:// ada-lovelace', 'Compilers', 'Python']) {
      expect(left).toContain(text);
      expect(right).not.toContain(text);
    }
    for (const text of ['Analytical Engines', 'KPCB Fellow', 'First paper.']) {
      expect(right).toContain(text);
      expect(left).not.toContain(text);
    }
  });

  it('draws small caps from capitals, so the role stays plain text', () => {
    // font-variant: small-caps can reach the PDF as private-use glyphs; instead each
    // lowercase run is a smaller uppercase span and the text itself is unchanged.
    const { container } = render(<ResumeDeedy data={buildData()} />);
    const heading = container.querySelector('[class*="mainColumn"] [class*="entryHeading"]');
    expect(heading?.textContent).toBe('Analytical Engines | Software Engineer');
    const smallCaps = Array.from(heading?.querySelectorAll('[class*="smallCap"]') ?? []);
    expect(smallCaps.map((span) => span.textContent)).toEqual(['oftware', 'ngineer']);
  });

  it('shows every contact value, links as typed minus www.', () => {
    const { container } = render(<ResumeDeedy data={buildData()} />);
    const header = container.querySelector('header')?.textContent ?? '';
    expect(header).toContain(
      'ada.example.com | https://www.linkedin.com/in/ada-lovelace/ | github.com/ada'
    );
    expect(header).toContain('ada@example.com | 555-0100 | London');
  });

  it('respects hidden sections and drops blank skills', () => {
    render(<ResumeDeedy data={buildData()} />);
    expect(screen.queryByText('Hidden summary text.')).toBeNull();
    // The non-breaking space keeps each bullet with the item before it.
    expect(screen.getByText('Python • Go').textContent).toBe('Python\u00A0• Go');
  });

  it('lays out awards as year | rank | title only when every award has a year', () => {
    const { container, rerender } = render(<ResumeDeedy data={buildData()} />);
    const cells = () =>
      Array.from(container.querySelectorAll('[class*="awards"] > span')).map((c) => c.textContent);
    expect(cells()).toEqual(['2014', 'top 52/2500', 'KPCB Fellow', '2019', '', 'Excellence Award']);

    const noYear = buildData();
    noYear.additional!.awards = ['KPCB Fellow (2013 - 2016)', 'Excellence Award (2019)'];
    rerender(<ResumeDeedy data={noYear} />);
    expect(cells()).toEqual([]);
    expect(screen.getByText('KPCB Fellow (2013 - 2016)')).toBeInTheDocument();
    expect(screen.getByText('Excellence Award (2019)')).toBeInTheDocument();
  });

  it('numbers publication entries', () => {
    render(<ResumeDeedy data={buildData()} />);
    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('[2]')).toBeInTheDocument();
    expect(screen.getByText('Second paper.')).toBeInTheDocument();
  });
});
