import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { InterviewBrief, InterviewPrepView } from '@/components/builder/interview-prep-view';
import type { InterviewPrepData } from '@/components/common/resume_previewer_context';
import {
  clearInterviewPractice,
  readInterviewPractice,
} from '@/lib/utils/interview-practice-storage';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key} ${Object.values(params).join(' ')}` : key,
  }),
}));

afterEach(() => localStorage.clear());

// Each control is named with its question, so they can be told apart.
const PRACTISED_API = 'interviewPrep.practice.practised How did you build the API?';
const NOTES = /^interviewPrep\.practice\.notesLabel: /;

const interviewPrep: InterviewPrepData = {
  role_fit_analysis: ['Backend API experience fits the role.'],
  resume_questions: [
    {
      question: 'How did you build the API?',
      focus_area: 'Backend architecture',
      suggested_answer_points: ['Discuss resume-grounded API work.'],
    },
  ],
  project_follow_ups: [
    {
      question: 'What tradeoffs did you make in the matcher project?',
      focus_area: 'Project tradeoffs',
      suggested_answer_points: ['Explain real implementation choices.'],
    },
  ],
  skill_gaps: [
    {
      skill: 'Kubernetes',
      why_it_matters: 'The JD mentions deployments.',
      preparation_suggestion: 'Review basics without claiming experience.',
    },
  ],
  talking_points: ['Connect API work to the role.'],
};

describe('InterviewPrepView', () => {
  it('renders an empty state and calls onGenerate', () => {
    const onGenerate = vi.fn();
    render(
      <InterviewPrepView
        interviewPrep={null}
        isGenerating={false}
        onGenerate={onGenerate}
        isTailoredResume
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /builder\.generatePrompt\.generateButton/ })
    );

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('renders loading and error states in the empty view', () => {
    render(
      <InterviewPrepView
        interviewPrep={null}
        isGenerating
        error="Generation failed"
        onGenerate={vi.fn()}
        isTailoredResume
      />
    );

    expect(screen.getByText('Generation failed')).toBeInTheDocument();
    expect(screen.getByText('common.generating')).toBeInTheDocument();
  });

  it('disables generation when job context is unavailable', () => {
    const onGenerate = vi.fn();
    render(
      <InterviewPrepView
        interviewPrep={null}
        isGenerating={false}
        error={null}
        onGenerate={onGenerate}
        isTailoredResume
        canGenerate={false}
        unavailableMessage="No saved job context"
      />
    );

    expect(screen.getByText('interviewPrep.unavailableTitle')).toBeInTheDocument();
    expect(screen.getByText('No saved job context')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('splits the prep: the brief holds fit, gaps and points; practice holds only questions', () => {
    render(
      <>
        <section aria-label="brief">
          <InterviewBrief title={null} keywords={null} jobDescription={null} prep={interviewPrep} />
        </section>
        <section aria-label="practice">
          <InterviewPrepView
            interviewPrep={interviewPrep}
            isGenerating={false}
            onGenerate={vi.fn()}
            isTailoredResume
          />
        </section>
      </>
    );

    const brief = screen.getByRole('region', { name: 'brief' });
    const practice = screen.getByRole('region', { name: 'practice' });
    expect(within(brief).getByText('Backend API experience fits the role.')).toBeInTheDocument();
    expect(within(brief).getByText('Kubernetes')).toBeInTheDocument();
    expect(within(brief).getByText('Connect API work to the role.')).toBeInTheDocument();

    expect(within(practice).getByText('How did you build the API?')).toBeInTheDocument();
    expect(
      within(practice).getByText('What tradeoffs did you make in the matcher project?')
    ).toBeInTheDocument();
    expect(within(practice).queryByText('Backend API experience fits the role.')).toBeNull();
    expect(within(practice).queryByText('Kubernetes')).toBeNull();
  });

  it('marks list items with ink squares, not blue', () => {
    const { container } = render(
      <InterviewBrief title={null} keywords={null} jobDescription={null} prep={interviewPrep} />
    );

    const markers = container.querySelectorAll('li > span[aria-hidden="true"]');
    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) {
      expect(marker).toHaveClass('size-1', 'bg-ink');
      expect(marker).not.toHaveClass('bg-primary');
    }
  });

  it('shows a default unavailable message for generated prep when regeneration is blocked', () => {
    render(
      <InterviewPrepView
        interviewPrep={interviewPrep}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
        canGenerate={false}
      />
    );

    expect(screen.getByText('interviewPrep.missingContextDescription')).toBeInTheDocument();
    expect(screen.getByText('How did you build the API?')).toBeInTheDocument();
  });

  it('keeps answer points closed until asked for', () => {
    render(
      <InterviewPrepView
        interviewPrep={interviewPrep}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
      />
    );
    expect(screen.queryByText('Discuss resume-grounded API work.')).toBeNull();

    const [show] = screen.getAllByRole('button', { name: 'interviewPrep.practice.showPoints' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(show);

    expect(screen.getByText('Discuss resume-grounded API work.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'interviewPrep.practice.hidePoints' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('counts practised questions and keeps marks and notes in this browser', () => {
    const { unmount } = render(
      <InterviewPrepView
        interviewPrep={interviewPrep}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
        resumeId="r1"
      />
    );
    expect(screen.getByText('interviewPrep.practice.progress 0 2')).toBeInTheDocument();
    expect(screen.getByText('interviewPrep.practice.localNote')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: PRACTISED_API }));
    expect(screen.getByText('interviewPrep.practice.progress 1 2')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'interviewPrep.practice.notes' })[1]);
    fireEvent.change(screen.getByRole('textbox', { name: NOTES }), {
      target: { value: 'Lead with the cache.' },
    });

    expect(readInterviewPractice('r1')).toEqual({
      practised: ['resume:How did you build the API?'],
      notes: {
        'project:What tradeoffs did you make in the matcher project?': 'Lead with the cache.',
      },
    });

    // A new visit reads them back.
    unmount();
    render(
      <InterviewPrepView
        interviewPrep={interviewPrep}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
        resumeId="r1"
      />
    );
    expect(screen.getByText('interviewPrep.practice.progress 1 2')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: PRACTISED_API })).toBeChecked();
    expect(screen.getByRole('textbox', { name: NOTES })).toHaveValue('Lead with the cache.');
  });

  it('starts a regenerated set clean once its stored practice is cleared', () => {
    localStorage.setItem(
      'resume_interview_practice:r1',
      JSON.stringify({ practised: ['resume:How did you build the API?'], notes: {} })
    );
    const { rerender } = render(
      <InterviewPrepView
        interviewPrep={interviewPrep}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
        resumeId="r1"
      />
    );
    expect(screen.getByText('interviewPrep.practice.progress 1 2')).toBeInTheDocument();

    // What the builder does on a successful regenerate: clear, then set the new prep.
    clearInterviewPractice('r1');
    rerender(
      <InterviewPrepView
        interviewPrep={{ ...interviewPrep }}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
        resumeId="r1"
      />
    );
    expect(screen.getByText('interviewPrep.practice.progress 0 2')).toBeInTheDocument();
  });

  it('keeps a stored note open while its text is cleared', () => {
    localStorage.setItem(
      'resume_interview_practice:r1',
      JSON.stringify({ practised: [], notes: { 'resume:How did you build the API?': 'Old' } })
    );
    render(
      <InterviewPrepView
        interviewPrep={interviewPrep}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
        resumeId="r1"
      />
    );
    const note = screen.getByRole('textbox', { name: NOTES });
    fireEvent.change(note, { target: { value: '' } });
    expect(screen.getByRole('textbox', { name: NOTES })).toHaveValue('');
    expect(readInterviewPractice('r1').notes).toEqual({});
  });

  it('names each control with its question, so a list of controls tells them apart', () => {
    render(
      <InterviewPrepView
        interviewPrep={interviewPrep}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
        resumeId="r1"
      />
    );
    expect(
      screen.getByRole('checkbox', {
        name: 'interviewPrep.practice.practised What tradeoffs did you make in the matcher project?',
      })
    ).toBeInTheDocument();
    const [notes] = screen.getAllByRole('button', { name: 'interviewPrep.practice.notes' });
    expect(notes).toHaveAccessibleDescription('How did you build the API?');
    fireEvent.click(notes);
    expect(
      screen.getByRole('textbox', {
        name: 'interviewPrep.practice.notesLabel: How did you build the API?',
      })
    ).toBeInTheDocument();
  });

  it('keeps a mark and a note for each of two identical questions', () => {
    const repeated: InterviewPrepData = {
      ...interviewPrep,
      resume_questions: [interviewPrep.resume_questions[0], interviewPrep.resume_questions[0]],
    };
    render(
      <InterviewPrepView
        interviewPrep={repeated}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
        resumeId="r1"
      />
    );
    const [first, second] = screen.getAllByRole('checkbox', { name: PRACTISED_API });
    fireEvent.click(second);

    expect(first).not.toBeChecked();
    expect(second).toBeChecked();
    expect(screen.getByText('interviewPrep.practice.progress 1 3')).toBeInTheDocument();
    expect(readInterviewPractice('r1').practised).toEqual(['resume:How did you build the API?#2']);
  });

  it('says so when this browser will not save the marks and notes', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      render(
        <InterviewPrepView
          interviewPrep={interviewPrep}
          isGenerating={false}
          onGenerate={vi.fn()}
          isTailoredResume
          resumeId="r1"
        />
      );
      fireEvent.click(screen.getByRole('checkbox', { name: PRACTISED_API }));
      expect(screen.getByRole('status')).toHaveTextContent('interviewPrep.practice.saveFailed');
    } finally {
      setItem.mockRestore();
    }
  });

  it('stores nothing without a resume ID', () => {
    render(
      <InterviewPrepView
        interviewPrep={interviewPrep}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: PRACTISED_API }));
    expect(screen.getByText('interviewPrep.practice.progress 1 2')).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });

  it('puts the generate prompt on the cross field once the job context is ready', () => {
    const { container } = render(
      <InterviewPrepView
        interviewPrep={null}
        isGenerating={false}
        onGenerate={vi.fn()}
        isTailoredResume
      />
    );
    expect(container.querySelector('svg pattern')).not.toBeNull();
  });
});

describe('InterviewBrief', () => {
  it('names the job, lists its keywords and keeps the description closed', () => {
    const { container } = render(
      <InterviewBrief
        title="Backend Engineer @ Acme"
        keywords={['Python', 'Kubernetes']}
        jobDescription="We build APIs."
        prep={null}
      />
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Backend Engineer @ Acme' })
    ).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    const details = container.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('We build APIs.')).toBeInTheDocument();
    // Before generation the brief says what generating adds.
    expect(screen.getByText('interviewPrep.brief.pending')).toBeInTheDocument();
  });
});

describe('interview practice storage', () => {
  it('reads unreadable or malformed data as empty', () => {
    localStorage.setItem('resume_interview_practice:bad', '{not json');
    expect(readInterviewPractice('bad')).toEqual({ practised: [], notes: {} });
    localStorage.setItem(
      'resume_interview_practice:odd',
      JSON.stringify({ practised: [1, 'a'], notes: { x: 2, y: 'b' } })
    );
    expect(readInterviewPractice('odd')).toEqual({ practised: ['a'], notes: { y: 'b' } });
  });
});
