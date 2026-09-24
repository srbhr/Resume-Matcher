import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InterviewQuestionsDialog } from '@/components/tracker/interview-questions-dialog';
import {
  createApplicationInterviewQuestion,
  deleteApplicationInterviewQuestion,
  listApplicationInterviewQuestions,
  type Application,
} from '@/lib/api/tracker';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/lib/api/tracker', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/tracker')>('@/lib/api/tracker');
  return {
    ...actual,
    listApplicationInterviewQuestions: vi.fn(),
    createApplicationInterviewQuestion: vi.fn(),
    deleteApplicationInterviewQuestion: vi.fn(),
  };
});

const application: Application = {
  application_id: 'app-1',
  job_id: 'job-1',
  resume_id: 'resume-1',
  master_resume_id: null,
  status: 'interview',
  company: 'Acme',
  role: 'Backend Engineer',
  applied_at: '2026-01-01T00:00:00Z',
  interview_times: [],
  notes: null,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('InterviewQuestionsDialog', () => {
  beforeEach(() => {
    vi.mocked(listApplicationInterviewQuestions).mockReset();
    vi.mocked(createApplicationInterviewQuestion).mockReset();
    vi.mocked(deleteApplicationInterviewQuestion).mockReset();
  });

  it('renders every question with its company and role', async () => {
    vi.mocked(listApplicationInterviewQuestions).mockResolvedValue({
      questions: [
        {
          question_id: 'q1',
          application_id: 'app-1',
          question: 'Explain database isolation.',
          company: 'Acme',
          role: 'Backend Engineer',
        },
      ],
    });

    render(<InterviewQuestionsDialog open onOpenChange={vi.fn()} applications={[application]} />);

    expect(await screen.findByText('Explain database isolation.')).toBeInTheDocument();
    expect(screen.getByText('Acme / Backend Engineer')).toBeInTheDocument();
  });

  it('renders an empty state when no questions have been recorded', async () => {
    vi.mocked(listApplicationInterviewQuestions).mockResolvedValue({ questions: [] });

    render(<InterviewQuestionsDialog open onOpenChange={vi.fn()} applications={[application]} />);

    expect(await screen.findByText('tracker.questions.empty')).toBeInTheDocument();
  });

  it('renders a generic load error', async () => {
    vi.mocked(listApplicationInterviewQuestions).mockRejectedValue(new Error('boom'));

    render(<InterviewQuestionsDialog open onOpenChange={vi.fn()} applications={[application]} />);

    expect(await screen.findByText('tracker.questions.loadFailed')).toBeInTheDocument();
  });

  it('adds a question from the global view', async () => {
    vi.mocked(listApplicationInterviewQuestions).mockResolvedValue({ questions: [] });
    vi.mocked(createApplicationInterviewQuestion).mockResolvedValue({
      question_id: 'q1',
      application_id: 'app-1',
      question: 'Why this role?',
      company: 'Acme',
      role: 'Backend Engineer',
    });

    render(<InterviewQuestionsDialog open onOpenChange={vi.fn()} applications={[application]} />);

    expect(await screen.findByText('tracker.questions.empty')).toBeInTheDocument();
    const input = screen.getByPlaceholderText('tracker.modal.questionPlaceholder');
    const addButton = screen.getByRole('button', { name: 'tracker.modal.addQuestion' });
    fireEvent.change(input, { target: { value: 'Why this role?' } });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.click(addButton);

    await waitFor(() =>
      expect(createApplicationInterviewQuestion).toHaveBeenCalledWith('app-1', 'Why this role?')
    );
    expect(await screen.findByText('Why this role?')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('deletes a question from the global view', async () => {
    vi.mocked(listApplicationInterviewQuestions).mockResolvedValue({
      questions: [
        {
          question_id: 'q1',
          application_id: 'app-1',
          question: 'Delete me',
          company: 'Acme',
          role: 'Backend Engineer',
        },
      ],
    });
    vi.mocked(deleteApplicationInterviewQuestion).mockResolvedValue({
      message: 'ok',
      affected: 1,
    });

    render(<InterviewQuestionsDialog open onOpenChange={vi.fn()} applications={[application]} />);

    expect(await screen.findByText('Delete me')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'a11y.removeItem' }));

    await waitFor(() =>
      expect(deleteApplicationInterviewQuestion).toHaveBeenCalledWith('app-1', 'q1')
    );
    expect(screen.queryByText('Delete me')).not.toBeInTheDocument();
  });
});
