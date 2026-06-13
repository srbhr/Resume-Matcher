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
    expect(screen.getByText('resumeWizard.preview.empty')).toBeInTheDocument();
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
});
