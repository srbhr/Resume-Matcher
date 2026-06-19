import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumeVivid } from '@/components/resume/resume-vivid';
import type { ResumeData } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

const data: ResumeData = {
  personalInfo: { name: 'Saurabh Rai', title: 'Solutions Architect', email: 'a@b.com' },
  workExperience: [
    {
      id: 1,
      title: 'DevRel Engineer',
      company: 'Apideck',
      years: '2025-Present',
      description: ['Lead client demos.'],
    },
  ],
  additional: { technicalSkills: ['Python', 'TypeScript'] },
} as ResumeData;

describe('ResumeVivid', () => {
  it('splits the name into two tones and renders company + bullet', () => {
    render(<ResumeVivid data={data} />);
    expect(screen.getByText('Saurabh')).toBeInTheDocument(); // first token only
    expect(screen.getByText('Rai')).toBeInTheDocument(); // remaining tokens
    expect(screen.getByText('Apideck')).toBeInTheDocument();
    expect(screen.getByText('Solutions Architect')).toBeInTheDocument();
    expect(screen.getByText('Lead client demos.')).toBeInTheDocument();
  });

  it('renders skills joined with bullet separators in the sidebar', () => {
    render(<ResumeVivid data={data} />);
    expect(screen.getByText('Python • TypeScript')).toBeInTheDocument();
  });

  it('does not render an orphaned leading pipe when years is missing but location exists', () => {
    const noYears: ResumeData = {
      personalInfo: { name: 'Saurabh Rai' },
      workExperience: [{ id: 1, title: 'Engineer', company: 'Apideck', location: 'Remote' }],
    } as ResumeData;
    render(<ResumeVivid data={noYears} />);
    // Meta should be just the location, never "| Remote".
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.queryByText('| Remote')).toBeNull();
  });
});
