import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('disables Create on the review step when the draft cannot be finalized', () => {
    const { rerender } = render(<QuestionCard step="review" {...baseProps} canFinalize={false} />);
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.create' })).toBeDisabled();

    rerender(<QuestionCard step="review" {...baseProps} canFinalize />);
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.create' })).toBeEnabled();
  });
});
