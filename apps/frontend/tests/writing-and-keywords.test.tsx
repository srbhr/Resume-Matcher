import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TailorProgress } from '@/components/tailor/tailor-progress';
import { WritingScoreCard } from '@/components/tailor/writing-score-card';
import { KeywordForcingPanel } from '@/components/tailor/keyword-forcing-panel';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import { HighlightedResumeView } from '@/components/builder/highlighted-resume-view';
import type { ResumeData } from '@/components/dashboard/resume-component';
import type { WritingReport } from '@/lib/api/writing';
import { locatePath, lineAt, splitByKeywords } from '@/lib/utils/resume-paths';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));

const resume: ResumeData = {
  summary: 'Platform engineer.',
  workExperience: [
    {
      id: 1,
      title: 'Engineer',
      company: 'Acme',
      description: ['Responsible for the build', 'Ran Kubernetes clusters'],
    },
  ],
  personalProjects: [{ id: 1, name: 'CLI', description: ['Wrote a CLI'] }],
  additional: { technicalSkills: ['Kubernetes', 'Python'] },
};

describe('resume paths', () => {
  it('names summary, bullets and skills', () => {
    expect(locatePath(resume, 'summary')).toEqual({ kind: 'summary' });
    expect(locatePath(resume, 'additional.technicalSkills')).toEqual({ kind: 'skills' });
    expect(locatePath(resume, 'workExperience[0].description[1]')).toEqual({
      kind: 'bullet',
      entry: 'Acme',
      line: 2,
    });
    expect(locatePath(resume, 'personalProjects[0].description[0]')).toMatchObject({
      entry: 'CLI',
    });
    expect(lineAt(resume, 'workExperience[0].description[0]')).toBe('Responsible for the build');
  });

  it('splits on whole-term, case-insensitive keyword matches', () => {
    expect(splitByKeywords('Ran kubernetes and KubernetesX', ['Kubernetes'])).toEqual([
      { text: 'Ran ', match: false },
      { text: 'kubernetes', match: true },
      { text: ' and KubernetesX', match: false },
    ]);
  });
});

describe('TailorProgress', () => {
  it('marks steps before the live stage done and the stage current', () => {
    render(
      <TailorProgress stage="critique_writing" elapsed={5} withSelection={false} withRewrite />
    );
    const items = screen.getAllByRole('listitem');
    const current = items.find((item) => item.getAttribute('aria-current') === 'step');
    expect(current).toHaveTextContent('tailor.progress.steps.critique');
    expect(within(items[0]).getByText(/tailor\.progress\.state\.done/)).toBeInTheDocument();
    expect(screen.queryByText(/steps\.select/)).not.toBeInTheDocument();
    expect(screen.queryByText('tailor.progress.slow')).not.toBeInTheDocument();
  });

  it('drops the rewrite step for Light nudge and explains slow runs', () => {
    render(<TailorProgress stage={null} elapsed={31} withSelection withRewrite={false} />);
    expect(screen.queryByText(/steps\.rewrite/)).not.toBeInTheDocument();
    expect(screen.getByText(/steps\.select/)).toBeInTheDocument();
    expect(screen.getByText('tailor.progress.slow')).toBeInTheDocument();
  });
});

describe('WritingScoreCard', () => {
  const writing: WritingReport = {
    score: 74,
    before_score: 52,
    findings: [
      {
        path: 'workExperience[0].description[0]',
        rule: 'weak_opener',
        severity: 'hard',
        excerpt: 'Responsible for the build',
      },
      {
        path: 'workExperience[0].description[1]',
        rule: 'no_metric',
        severity: 'soft',
        excerpt: 'Ran Kubernetes clusters',
      },
    ],
    critic_notes: [{ path: 'summary', note: 'Say what you build.' }],
    rewritten_paths: ['workExperience[0].description[1]'],
    rejected_rewrites: 1,
  };

  it('shows the score, the change, each line with its rules, and notes', () => {
    render(<WritingScoreCard writing={writing} resume={resume} />);
    expect(screen.getByText('74')).toBeInTheDocument();
    expect(screen.getByText('tailor.writingScore.beforeAfter {"before":52}')).toBeInTheDocument();
    expect(screen.getByText('Responsible for the build')).toBeInTheDocument();
    expect(screen.getByText('tailor.writingScore.rules.weak_opener')).toBeInTheDocument();
    expect(screen.getByText('tailor.writingScore.rules.no_metric')).toBeInTheDocument();
    expect(screen.getByText('tailor.writingScore.rewritten {"count":1}')).toBeInTheDocument();
    expect(screen.getByText('tailor.writingScore.rejected {"count":1}')).toBeInTheDocument();
    expect(screen.getByText(/Say what you build\./)).toBeInTheDocument();
    // The line with a hard finding is listed first.
    const lines = screen
      .getByText('tailor.writingScore.findingsTitle')
      .parentElement!.querySelectorAll(':scope > ul > li');
    expect(lines[0]).toHaveTextContent('Responsible for the build');
  });

  it('says so when nothing is wrong', () => {
    render(
      <WritingScoreCard
        writing={{ ...writing, findings: [], critic_notes: [], before_score: null }}
        resume={resume}
      />
    );
    expect(screen.getByText('tailor.writingScore.noFindings')).toBeInTheDocument();
  });
});

describe('KeywordForcingPanel', () => {
  it('sends supported keywords plainly and unsupported ones as attested', () => {
    const onApply = vi.fn();
    render(
      <KeywordForcingPanel unsupported={['Terraform']} supported={['Docker']} onApply={onApply} />
    );
    const apply = screen.getByRole('button', { name: /applyButton/ });
    expect(apply).toBeDisabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Docker/ }));
    fireEvent.click(screen.getByRole('button', { name: /Terraform/ }));
    expect(screen.getByRole('button', { name: /Terraform/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // A confirmed keyword offers adding it to the master, on by default.
    expect(screen.getByRole('checkbox')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /applyButton/ }));
    expect(onApply).toHaveBeenCalledWith(
      [
        { keyword: 'Docker', attested: false },
        { keyword: 'Terraform', attested: true },
      ],
      true
    );
  });

  it('does not add to the master when only supported keywords are applied', () => {
    const onApply = vi.fn();
    render(<KeywordForcingPanel unsupported={[]} supported={['Docker']} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: /Docker/ }));
    fireEvent.click(screen.getByRole('button', { name: /applyButton/ }));
    expect(onApply).toHaveBeenCalledWith([{ keyword: 'Docker', attested: false }], false);
  });

  it('renders nothing when there is nothing to add', () => {
    const { container } = render(
      <KeywordForcingPanel unsupported={[]} supported={[]} onApply={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DiffPreviewModal keyword reveal', () => {
  it('lists where each keyword landed and marks it in the new text', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={{
          total_changes: 1,
          skills_added: 1,
          skills_removed: 0,
          descriptions_modified: 1,
          certifications_added: 0,
          high_risk_changes: 0,
        }}
        detailedChanges={[
          {
            field_path: 'workExperience[0].description[1]',
            field_type: 'description',
            change_type: 'modified',
            original_value: 'Ran clusters',
            new_value: 'Ran Kubernetes clusters',
            confidence: 'medium',
          },
        ]}
        placements={[
          {
            keyword: 'Kubernetes',
            paths: ['workExperience[0].description[1]', 'additional.technicalSkills'],
          },
          { keyword: 'Helm', paths: [] },
        ]}
        resume={resume}
        heavyMode
        keywordPanel={<p>keyword panel slot</p>}
      />
    );
    expect(screen.getByText('tailor.diffModal.heavyTag')).toBeInTheDocument();
    expect(screen.getByText('tailor.heavyWarning')).toBeInTheDocument();
    expect(screen.getByText('keyword panel slot')).toBeInTheDocument();
    expect(
      screen.getByText(
        'tailor.forceKeywords.where.bullet {"entry":"Acme","line":2} · tailor.forceKeywords.where.skills'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('tailor.forceKeywords.nowhere')).toBeInTheDocument();
    const marks = screen.getAllByText('Kubernetes').filter((el) => el.tagName === 'MARK');
    // One in the placement list, one inside the changed line.
    expect(marks).toHaveLength(2);
    expect(marks.every((mark) => mark.className.includes('bg-primary'))).toBe(true);
  });
});

describe('HighlightedResumeView forced keywords', () => {
  it('highlights forced keywords in blue and other matches in yellow', () => {
    render(
      <HighlightedResumeView
        resumeData={resume}
        keywords={['Kubernetes', 'Python']}
        forcedKeywords={['kubernetes']}
      />
    );
    const forced = screen
      .getAllByText('Kubernetes')
      .find((el) => el.tagName === 'MARK') as HTMLElement;
    expect(forced.className).toContain('bg-primary');
    const pythonTag = screen.getByText('Python');
    expect(pythonTag.className).toContain('bg-highlight');
    const kubernetesTag = screen
      .getAllByText('Kubernetes')
      .find((el) => el.tagName === 'SPAN' && el.className.includes('inline-block')) as HTMLElement;
    expect(kubernetesTag.className).toContain('bg-primary');
  });
});
