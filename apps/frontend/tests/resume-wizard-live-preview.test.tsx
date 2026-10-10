import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LivePreview } from '@/components/resume-wizard/live-preview';
import { createInitialResumeWizardState } from '@/lib/api/resume-wizard';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

describe('LivePreview', () => {
  it('shows the empty state before any answers', () => {
    render(
      <LivePreview resumeData={createInitialResumeWizardState().resume_data} inferredSkills={[]} />
    );
    const empty = screen.getByText('resumeWizard.preview.empty');
    // An empty state (EmptyState plain), not a live "active" status.
    expect(empty).toHaveClass('text-ink');
    expect(empty).not.toHaveClass('text-primary');
    expect(empty.parentElement).toHaveClass('py-6', 'items-start');
    expect(screen.getByRole('complementary').querySelector('.bg-primary')).toBeNull();
  });

  it('renders name, experience and skills as content (not counts)', () => {
    const data = createInitialResumeWizardState().resume_data;
    data.personalInfo = { name: 'Priya Shah' };
    data.workExperience = [
      { id: 1, title: 'Senior PM', company: 'Acme', years: '2021', description: ['Cut churn 18%'] },
    ];
    data.additional = { technicalSkills: ['SQL', 'Roadmapping'] };

    render(<LivePreview resumeData={data} inferredSkills={[]} />);

    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText(/Senior PM/)).toBeInTheDocument();
    expect(screen.getByText('Cut churn 18%')).toBeInTheDocument();
    const region = screen.getByRole('complementary');
    expect(within(region).getByText('SQL')).toBeInTheDocument();
  });

  it('deduplicates inferred and existing skills case-insensitively', () => {
    const data = createInitialResumeWizardState().resume_data;
    data.personalInfo = { name: 'Priya' };
    data.additional = { technicalSkills: ['React'] };

    render(<LivePreview resumeData={data} inferredSkills={['react', 'Node.js']} />);

    expect(screen.getAllByText(/^react$/i)).toHaveLength(1);
    expect(screen.getByText('Node.js')).toBeInTheDocument();
  });

  it('marks inferred skills with a hidden icon, not a text glyph', () => {
    const data = createInitialResumeWizardState().resume_data;
    data.personalInfo = { name: 'Priya' };

    render(<LivePreview resumeData={data} inferredSkills={['Node.js']} />);

    const chip = screen.getByText('Node.js');
    expect(chip).toHaveClass('border-success', 'text-success');
    expect(chip.textContent).not.toContain('✓');
    expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('names inferred skills in text so colour and an icon are not the only cue', () => {
    const data = createInitialResumeWizardState().resume_data;
    data.personalInfo = { name: 'Priya' };
    data.additional = { technicalSkills: ['SQL'] };

    render(<LivePreview resumeData={data} inferredSkills={['Node.js']} />);

    const inferred = screen.getByText('Node.js');
    expect(inferred).toHaveTextContent('resumeWizard.preview.inferredSkill');
    expect(within(inferred).getByText('resumeWizard.preview.inferredSkill')).toHaveClass('sr-only');
    expect(screen.getAllByText('resumeWizard.preview.inferredSkill')).toHaveLength(1);
    expect(screen.getByText('SQL')).not.toHaveTextContent('resumeWizard.preview.inferredSkill');
  });
});
