import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumeLatex } from '@/components/resume/resume-latex';
import type { ResumeData } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

const data: ResumeData = {
  personalInfo: { name: 'Saurabh Rai', location: 'Delhi, India', email: 'a@b.com' },
  workExperience: [
    {
      id: 1,
      title: 'DevRel Engineer',
      company: 'Apideck',
      location: 'Remote',
      years: '2025-Present',
      description: ['Lead client demos.'],
    },
  ],
  additional: { technicalSkills: ['Python', '', 'TypeScript'] },
} as ResumeData;

describe('ResumeLatex', () => {
  it('renders name, company-first entry, role and a bullet', () => {
    render(<ResumeLatex data={data} />);
    expect(screen.getByText('Saurabh Rai')).toBeInTheDocument();
    expect(screen.getByText('Delhi, India')).toBeInTheDocument();
    expect(screen.getByText('Apideck')).toBeInTheDocument();
    expect(screen.getByText('DevRel Engineer')).toBeInTheDocument();
    expect(screen.getByText('Lead client demos.')).toBeInTheDocument();
  });

  it('drops blank additional entries (issue #763 parity)', () => {
    render(<ResumeLatex data={data} />);
    expect(screen.getByText(/Python, TypeScript/)).toBeInTheDocument();
  });
});
