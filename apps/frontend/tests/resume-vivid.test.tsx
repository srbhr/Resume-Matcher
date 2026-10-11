import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('ResumeVivid text layer', () => {
  // Font small caps reach the PDF text layer as private-use glyphs ("Snior Softwar Enginr")
  // and partially transparent text becomes a transparency group the text extractor skips,
  // so an ATS would misread the role and drop the surname.
  it('draws headings and roles as capitals and the surname as a solid tint', () => {
    const { container } = render(<ResumeVivid data={data} />);
    const headings = Array.from(container.querySelectorAll('h3'));
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) expect(h.className).toMatch(/sectionTitleCaps|sectionTitleSm/);
    expect(screen.getByText('DevRel Engineer').className).toMatch(/entryRoleCaps/);
    expect(screen.getByText('Rai').className).toMatch(/nameRestSolid/);
  });

  it('keeps small caps and opacity out of the stylesheet', () => {
    const css = readFileSync(
      join(process.cwd(), 'components/resume/styles/vivid.module.css'),
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/small-caps|smcp|font-feature-settings|font-variant-caps/);
    expect(css).not.toMatch(/opacity/);
  });
});
