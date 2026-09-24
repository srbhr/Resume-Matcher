import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApplicationCard } from '@/components/tracker/application-card';
import { CardDetailModal } from '@/components/tracker/card-detail-modal';
import {
  getApplicationDetail,
  updateApplication,
  type Application,
  type ApplicationDetail,
} from '@/lib/api/tracker';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number>) =>
      params?.count !== undefined ? `${key}:${params.count}` : key,
  }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock('@/lib/api/tracker', () => ({
  getApplicationDetail: vi.fn(),
  updateApplication: vi.fn(),
}));

const INTERVIEW_TIMES = ['2026-10-02T14:30', '2026-10-08T10:00'];

function application(overrides: Partial<Application> = {}): Application {
  return {
    application_id: 'app-1',
    job_id: 'job-1',
    resume_id: 'resume-1',
    master_resume_id: null,
    status: 'interview',
    company: 'Acme',
    role: 'Engineer',
    applied_at: '2026-09-20T09:00:00Z',
    interview_times: INTERVIEW_TIMES,
    notes: null,
    position: 0,
    created_at: '2026-09-20T09:00:00Z',
    updated_at: '2026-09-20T09:00:00Z',
    ...overrides,
  };
}

function detail(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    ...application(),
    job_content: 'Job description',
    resume: null,
    interview_questions: [],
    ...overrides,
  };
}

describe('tracker interview times', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders every interview round on the card', () => {
    const { container } = render(
      <ApplicationCard
        application={application()}
        selected={false}
        sharedResume={false}
        onToggleSelect={vi.fn()}
        onOpen={vi.fn()}
      />
    );

    const times = container.querySelectorAll('time');
    expect(times).toHaveLength(2);
    expect(times[0].getAttribute('datetime')).toBe(INTERVIEW_TIMES[0]);
    expect(times[1].getAttribute('datetime')).toBe(INTERVIEW_TIMES[1]);
    expect(container.textContent).toContain('tracker.interview.round:1');
    expect(container.textContent).toContain('tracker.interview.round:2');
  });

  it('adds and saves multiple interview times while in the interview status', async () => {
    vi.mocked(getApplicationDetail).mockResolvedValue(detail({ interview_times: [] }));
    vi.mocked(updateApplication).mockResolvedValue(application());
    const onUpdated = vi.fn();

    render(
      <CardDetailModal applicationId="app-1" open onOpenChange={vi.fn()} onUpdated={onUpdated} />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'tracker.interview.add' }));
    fireEvent.click(screen.getByRole('button', { name: 'tracker.interview.add' }));

    const inputs = screen.getAllByLabelText(/tracker\.interview\.round/);
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: INTERVIEW_TIMES[0] } });
    fireEvent.change(inputs[1], { target: { value: INTERVIEW_TIMES[1] } });
    fireEvent.click(screen.getByRole('button', { name: 'tracker.interview.save' }));

    await waitFor(() => {
      expect(updateApplication).toHaveBeenCalledWith('app-1', {
        interview_times: INTERVIEW_TIMES,
      });
      expect(onUpdated).toHaveBeenCalledTimes(1);
    });
  });

  it('shows saved interview times read-only outside the interview status', async () => {
    vi.mocked(getApplicationDetail).mockResolvedValue(
      detail({ status: 'accepted', interview_times: INTERVIEW_TIMES })
    );

    render(
      <CardDetailModal applicationId="app-1" open onOpenChange={vi.fn()} onUpdated={vi.fn()} />
    );

    expect(await screen.findByText('tracker.interview.title')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'tracker.interview.add' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tracker\.interview\.round/)).not.toBeInTheDocument();
    expect(screen.getByText(/tracker\.interview\.round:1/)).toBeInTheDocument();
    expect(screen.getByText(/tracker\.interview\.round:2/)).toBeInTheDocument();
  });
});
