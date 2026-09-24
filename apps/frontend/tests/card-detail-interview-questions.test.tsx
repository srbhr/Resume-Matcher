import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CardDetailModal } from '@/components/tracker/card-detail-modal';
import {
  createApplicationInterviewQuestion,
  deleteApplicationInterviewQuestion,
  getApplicationDetail,
  type ApplicationDetail,
} from '@/lib/api/tracker';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/lib/api/tracker', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/tracker')>('@/lib/api/tracker');
  return {
    ...actual,
    getApplicationDetail: vi.fn(),
    createApplicationInterviewQuestion: vi.fn(),
    deleteApplicationInterviewQuestion: vi.fn(),
    updateApplication: vi.fn(),
  };
});

const detail: ApplicationDetail = {
  application_id: 'app-1',
  job_id: 'job-1',
  resume_id: 'resume-1',
  master_resume_id: null,
  status: 'applied',
  company: 'Acme',
  role: 'Backend Engineer',
  applied_at: '2026-01-01T00:00:00Z',
  interview_times: [],
  notes: null,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  job_content: 'Job description',
  resume: { resume_id: 'resume-1' },
  interview_questions: [],
};

describe('CardDetailModal interview questions', () => {
  beforeEach(() => {
    vi.mocked(getApplicationDetail).mockReset();
    vi.mocked(createApplicationInterviewQuestion).mockReset();
    vi.mocked(deleteApplicationInterviewQuestion).mockReset();
    vi.mocked(getApplicationDetail).mockResolvedValue(detail);
  });

  it('adds a question and renders it in the detail modal', async () => {
    vi.mocked(createApplicationInterviewQuestion).mockResolvedValue({
      question_id: 'q1',
      application_id: 'app-1',
      question: 'Explain database isolation.',
      company: 'Acme',
      role: 'Backend Engineer',
    });

    render(
      <CardDetailModal applicationId="app-1" open onOpenChange={vi.fn()} onUpdated={vi.fn()} />
    );

    const input = await screen.findByPlaceholderText('tracker.modal.questionPlaceholder');
    const addButton = screen.getByRole('button', { name: 'tracker.modal.addQuestion' });
    expect(addButton).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Explain database isolation.' } });
    expect(addButton).not.toBeDisabled();
    fireEvent.click(addButton);

    await waitFor(() =>
      expect(createApplicationInterviewQuestion).toHaveBeenCalledWith(
        'app-1',
        'Explain database isolation.'
      )
    );
    expect(await screen.findByText('Explain database isolation.')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('shows a generic error when adding a question fails', async () => {
    vi.mocked(createApplicationInterviewQuestion).mockRejectedValue(new Error('boom'));

    render(
      <CardDetailModal applicationId="app-1" open onOpenChange={vi.fn()} onUpdated={vi.fn()} />
    );

    const input = await screen.findByPlaceholderText('tracker.modal.questionPlaceholder');
    fireEvent.change(input, { target: { value: 'Question?' } });
    fireEvent.click(screen.getByRole('button', { name: 'tracker.modal.addQuestion' }));

    expect(await screen.findByText('common.error')).toBeInTheDocument();
  });

  it('deletes a saved question from the detail modal', async () => {
    vi.mocked(getApplicationDetail).mockResolvedValue({
      ...detail,
      interview_questions: [
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

    render(
      <CardDetailModal applicationId="app-1" open onOpenChange={vi.fn()} onUpdated={vi.fn()} />
    );

    expect(await screen.findByText('Delete me')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'a11y.removeItem' }));

    await waitFor(() =>
      expect(deleteApplicationInterviewQuestion).toHaveBeenCalledWith('app-1', 'q1')
    );
    expect(screen.queryByText('Delete me')).not.toBeInTheDocument();
  });
});
