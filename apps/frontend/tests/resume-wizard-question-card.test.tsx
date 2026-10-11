import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { QuestionCard } from '@/components/resume-wizard/question-card';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

const baseProps = {
  question: 'What is your most recent role?',
  sectionLabel: 'resumeWizard.sections.workExperience',
  progress: { current: 2, total: 8 },
  answer: '',
  onAnswerChange: vi.fn(),
  canGoBack: true,
  isBusy: false,
  onContinue: vi.fn(),
  onSkip: vi.fn(),
  onBack: vi.fn(),
  onReview: vi.fn(),
  onFinalize: vi.fn(),
  onKeepAdding: vi.fn(),
  warnings: [] as string[],
};

describe('QuestionCard', () => {
  it('on a question step shows the question, textbox, and question actions', () => {
    render(<QuestionCard step="question" {...baseProps} />);
    expect(screen.getByText('What is your most recent role?')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'resumeWizard.actions.continue' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.skip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.back' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'resumeWizard.actions.create' })
    ).not.toBeInTheDocument();
  });

  it('is a nested card: nested shadow, never a solid one', () => {
    const { container } = render(<QuestionCard step="question" {...baseProps} />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('border-2', 'border-ink', 'shadow-sw-nested');
    expect(card).not.toHaveClass('shadow-sw-default');
  });

  it('on the intro step hides skip, review, and back', () => {
    render(<QuestionCard step="intro" {...baseProps} canGoBack={false} />);
    expect(
      screen.getByRole('button', { name: 'resumeWizard.actions.continue' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'resumeWizard.actions.skip' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'resumeWizard.actions.review' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'resumeWizard.actions.back' })
    ).not.toBeInTheDocument();
  });

  it('on the review step shows create + keep adding and gentle notes', () => {
    render(
      <QuestionCard step="review" {...baseProps} warnings={['Add at least one contact method.']} />
    );
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.create' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'resumeWizard.actions.keepAdding' })
    ).toBeInTheDocument();
    expect(screen.getByText('Add at least one contact method.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('disables Continue when the answer is empty and calls onContinue when filled', () => {
    const onContinue = vi.fn();
    const { rerender } = render(
      <QuestionCard step="question" {...baseProps} onContinue={onContinue} answer="" />
    );
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.continue' })).toBeDisabled();

    rerender(
      <QuestionCard step="question" {...baseProps} onContinue={onContinue} answer="My answer" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows the ready hint on a question step only when isComplete', () => {
    const { rerender } = render(<QuestionCard step="question" {...baseProps} isComplete={false} />);
    expect(screen.queryByText('resumeWizard.readyHint')).not.toBeInTheDocument();

    rerender(<QuestionCard step="question" {...baseProps} isComplete />);
    expect(screen.getByText('resumeWizard.readyHint')).toBeInTheDocument();
  });

  it('names the progress bar after the section and reports its position as text', () => {
    render(<QuestionCard step="question" {...baseProps} />);
    const bar = screen.getByRole('progressbar', { name: 'resumeWizard.sections.workExperience' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuetext', '2/8');
  });

  it('ties the answer field to the question it answers', () => {
    render(<QuestionCard step="question" {...baseProps} />);
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription(
      'What is your most recent role?'
    );
  });

  describe('focus management', () => {
    it('does not take focus on first paint, even under StrictMode', () => {
      render(
        <StrictMode>
          <QuestionCard step="question" {...baseProps} />
        </StrictMode>
      );
      expect(document.body).toHaveFocus();
    });

    it.each([
      ['Continue', 'resumeWizard.actions.continue'],
      ['Skip', 'resumeWizard.actions.skip'],
      ['Back', 'resumeWizard.actions.back'],
    ])(
      'moves focus to the answer field when the next question arrives after %s',
      (_label, buttonName) => {
        const { rerender } = render(<QuestionCard step="question" {...baseProps} answer="Acme" />);
        fireEvent.click(screen.getByRole('button', { name: buttonName }));
        rerender(<QuestionCard step="question" {...baseProps} answer="Acme" isBusy />);
        expect(document.body).toHaveFocus();
        rerender(
          <QuestionCard
            step="question"
            {...baseProps}
            answer=""
            isBusy={false}
            question="Where did you study?"
          />
        );
        expect(screen.getByRole('textbox')).toHaveFocus();
      }
    );

    it('moves focus to the answer field after Enter submits the answer', () => {
      const { rerender } = render(<QuestionCard step="question" {...baseProps} answer="Acme" />);
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
      rerender(<QuestionCard step="question" {...baseProps} answer="Acme" isBusy />);
      rerender(<QuestionCard step="question" {...baseProps} question="Where did you study?" />);
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('moves focus to the answer field after Keep adding, which has no busy phase', () => {
      const { rerender } = render(<QuestionCard step="review" {...baseProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.keepAdding' }));
      rerender(<QuestionCard step="question" {...baseProps} question="Anything else?" />);
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('does not take focus when the card changes without a user action, like a restored draft', () => {
      const { rerender } = render(<QuestionCard step="intro" {...baseProps} />);
      rerender(<QuestionCard step="question" {...baseProps} question="Skills?" />);
      expect(document.body).toHaveFocus();
      rerender(<QuestionCard step="review" {...baseProps} question="All set?" />);
      expect(document.body).toHaveFocus();
    });

    it('does not move focus while busy, then focuses the heading once a review action finishes', () => {
      const { rerender } = render(<QuestionCard step="review" {...baseProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.create' }));
      // The review heading is always focusable, so only the busy guard keeps focus off it here.
      rerender(<QuestionCard step="review" {...baseProps} isBusy question="Next?" />);
      expect(document.body).toHaveFocus();
      rerender(<QuestionCard step="review" {...baseProps} isBusy={false} question="Next?" />);
      expect(screen.getByRole('heading', { name: 'Next?' })).toHaveFocus();
    });

    it('leaves focus alone while the user types in an unchanged question', () => {
      const { rerender } = render(<QuestionCard step="question" {...baseProps} />);
      const field = screen.getByRole('textbox');
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      rerender(<QuestionCard step="question" {...baseProps} answer="typing" />);
      expect(outside).toHaveFocus();
      expect(field).not.toHaveFocus();
      outside.remove();
    });

    it('focuses the heading on the review step, which has no field', () => {
      const { rerender } = render(<QuestionCard step="question" {...baseProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.review' }));
      rerender(<QuestionCard step="review" {...baseProps} question="All set?" />);
      expect(screen.getByRole('heading', { name: 'All set?' })).toHaveFocus();
    });
  });

  it('disables Create on the review step when the draft cannot be finalized', () => {
    const { rerender } = render(<QuestionCard step="review" {...baseProps} canFinalize={false} />);
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.create' })).toBeDisabled();

    rerender(<QuestionCard step="review" {...baseProps} canFinalize />);
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.create' })).toBeEnabled();
  });
});
