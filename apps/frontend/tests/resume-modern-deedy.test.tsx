import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumeModernDeedy } from '@/components/resume/resume-modern-deedy';
import type { ResumeData, SectionMeta } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

const data: ResumeData = {
  personalInfo: {
    name: 'Sarah Chen',
    email: 'sarah.chen@example.com',
    phone: '+1 415 555 0142',
    location: 'San Francisco, CA',
    linkedin: 'www.linkedin.com/in/sarahchen',
    github: 'https://github.com/sarahchen',
  },
  workExperience: [
    {
      id: 1,
      title: 'Senior Software Engineer',
      company: 'Fernway Payments',
      location: 'San Francisco, CA',
      years: 'Jul 2024 - Present',
      description: ['Shipped a <strong>RAG</strong> assistant.'],
      descriptionStyles: ['bullet'],
    },
  ],
  education: [
    {
      id: 1,
      institution: 'University of Washington',
      degree: 'B.S. Computer Science',
      years: '2016 - 2020',
      description: 'Teaching Assistant (TA): Algorithms',
    },
  ],
  personalProjects: [
    {
      id: 1,
      name: 'promptdiff',
      role: 'Python, Pydantic',
      years: '2024 - Present',
      github: 'github.com/sarahchen/promptdiff',
      description: ['Prompt test runner.'],
      descriptionStyles: ['plain'],
    },
    { id: 2, name: 'tidepool', description: [] },
  ],
  additional: {
    technicalSkills: ['Python', 'Go', 'TypeScript'],
    languages: ['English', 'Mandarin'],
    certificationsTraining: [],
    awards: [],
  },
} as ResumeData;

const text = (container: HTMLElement) => container.textContent ?? '';

describe('ResumeModernDeedy', () => {
  it('centres the name over one contact line joined with " | ", links as anchors', () => {
    const { container } = render(<ResumeModernDeedy data={data} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sarah Chen');
    expect(text(container)).toContain(
      'sarah.chen@example.com | +1 415 555 0142 | San Francisco, CA | linkedin.com/in/sarahchen | https://github.com/sarahchen'
    );
    expect(screen.getByRole('link', { name: 'sarah.chen@example.com' })).toHaveAttribute(
      'href',
      'mailto:sarah.chen@example.com'
    );
    // A bare host drops "www." in the label and gains a scheme in the link target.
    expect(screen.getByRole('link', { name: 'linkedin.com/in/sarahchen' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/sarahchen'
    );
    // A value typed with a scheme is shown exactly as typed.
    expect(screen.getByRole('link', { name: 'https://github.com/sarahchen' })).toHaveAttribute(
      'href',
      'https://github.com/sarahchen'
    );
  });

  it('puts company, role, place and dates on one header line in reading order', () => {
    const { container } = render(<ResumeModernDeedy data={data} />);
    expect(text(container)).toContain(
      'Fernway Payments | Senior Software Engineer' + 'San Francisco, CA | Jul 2024 - Present'
    );
  });

  it('renders inline <strong> from bullets and a round bullet marker', () => {
    render(<ResumeModernDeedy data={data} />);
    expect(screen.getByText('RAG').tagName).toBe('STRONG');
    expect(screen.getByText('RAG').closest('li')?.textContent).toContain('•');
  });

  it('shows the degree, then the institution, with the date on the degree line', () => {
    const { container } = render(<ResumeModernDeedy data={data} />);
    expect(text(container)).toContain(
      'B.S. Computer Science2016 - 2020University of WashingtonTeaching Assistant (TA): Algorithms'
    );
  });

  it('renders a project link icon, the role in the right slot, and plain descriptions', () => {
    const { container } = render(<ResumeModernDeedy data={data} />);
    const link = screen.getByRole('link', { name: 'github.com/sarahchen/promptdiff' });
    expect(link).toHaveAttribute('href', 'https://github.com/sarahchen/promptdiff');
    expect(link.querySelector('svg')).not.toBeNull();
    expect(text(container)).toContain('Python, Pydantic | 2024 - Present');
    expect(screen.getByText('Prompt test runner.').closest('li')?.textContent).not.toContain('•');
    // A project without a URL gets no icon.
    expect(screen.getByText('tidepool').parentElement?.querySelector('a')).toBeNull();
  });

  it('keeps real comma separators in the skills lines and skips empty categories', () => {
    const { container } = render(<ResumeModernDeedy data={data} />);
    expect(text(container)).toContain('Technical Skills: Python, Go, TypeScript');
    expect(text(container)).toContain('Languages: English, Mandarin');
    expect(text(container)).not.toContain('Certifications:');
    expect(text(container)).not.toContain('Awards:');
  });

  it('uses the localized skill labels when given', () => {
    const { container } = render(
      <ResumeModernDeedy
        data={data}
        additionalSectionLabels={{ technicalSkills: 'Compétences :', languages: 'Langues :' }}
      />
    );
    expect(text(container)).toContain('Compétences : Python, Go, TypeScript');
    expect(text(container)).toContain('Langues : English, Mandarin');
  });

  it('follows sectionMeta order, hides hidden sections and renders custom sections', () => {
    const meta = (key: string, order: number, extra: Partial<SectionMeta> = {}): SectionMeta => ({
      id: key,
      key,
      displayName: key === 'workExperience' ? 'Work' : key,
      sectionType: 'itemList',
      isDefault: key !== 'custom_1',
      isVisible: true,
      order,
      ...extra,
    });
    const custom: ResumeData = {
      ...data,
      sectionMeta: [
        meta('personalInfo', 0, { sectionType: 'personalInfo' }),
        meta('education', 1),
        meta('custom_1', 2, { displayName: 'Talks', sectionType: 'stringList' }),
        meta('workExperience', 3),
        meta('personalProjects', 4, { isVisible: false }),
      ],
      customSections: {
        custom_1: { sectionType: 'stringList', strings: ['PyCon 2025', 'KubeCon 2026'] },
      },
    };
    const { container } = render(<ResumeModernDeedy data={custom} />);
    const headings = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings).toEqual(['education', 'Talks', 'Work']);
    expect(text(container)).toContain('PyCon 2025, KubeCon 2026');
    expect(text(container)).not.toContain('promptdiff');
  });

  it('renders custom item sections with the same one-line header', () => {
    const custom: ResumeData = {
      personalInfo: { name: 'Sarah Chen' },
      sectionMeta: [
        {
          id: 'custom_1',
          key: 'custom_1',
          displayName: 'Volunteering',
          sectionType: 'itemList',
          isDefault: false,
          isVisible: true,
          order: 1,
        },
      ],
      customSections: {
        custom_1: {
          sectionType: 'itemList',
          items: [
            {
              id: 1,
              title: 'Code Club',
              subtitle: 'Mentor',
              location: 'Seattle, WA',
              years: '2021 - 2023',
              description: ['Taught Python to 30 students.'],
              descriptionStyles: ['bullet'],
            },
          ],
        },
      },
    } as ResumeData;
    const { container } = render(<ResumeModernDeedy data={custom} />);
    expect(text(container)).toContain('Code Club | MentorSeattle, WA | 2021 - 2023');
    expect(screen.getByText('Taught Python to 30 students.')).toBeInTheDocument();
  });

  it('does not render empty sections or an orphaned pipe when a header part is missing', () => {
    const sparse: ResumeData = {
      personalInfo: { name: 'Sarah Chen' },
      workExperience: [{ id: 1, company: 'Fernway', location: 'Remote' }],
      education: [],
      additional: { technicalSkills: [] },
    } as ResumeData;
    const { container } = render(<ResumeModernDeedy data={sparse} />);
    expect(text(container)).toContain('FernwayRemote');
    expect(text(container)).not.toContain('Fernway |');
    expect(text(container)).not.toContain('| Remote');
    expect(container.querySelectorAll('h3')).toHaveLength(1);
  });
});

describe('modern-deedy.module.css', () => {
  // Font small caps reach the PDF text layer as private-use glyphs ("Snior Softwar Enginr")
  // and partially transparent text becomes a transparency group the text extractor skips,
  // so an ATS would misread the role, the institution or the tech stack.
  const css = readFileSync(
    join(process.cwd(), 'components/resume/styles/modern-deedy.module.css'),
    'utf8'
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  it('fakes small caps with uppercase instead of font small caps', () => {
    expect(css).not.toMatch(/small-caps|smcp|font-feature-settings|font-variant-caps/);
    expect(css).toMatch(/\.smallCaps\s*\{[^}]*text-transform:\s*uppercase/);
  });

  it('uses solid colours only, never opacity', () => {
    expect(css).not.toMatch(/opacity/);
  });
});
