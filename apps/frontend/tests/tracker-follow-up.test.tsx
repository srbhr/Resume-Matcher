import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationCard } from '@/components/tracker/application-card';
import { CardDetailModal } from '@/components/tracker/card-detail-modal';
import {
  draftFollowUp,
  getApplicationDetail,
  updateApplication,
  type Application,
  type ApplicationDetail,
} from '@/lib/api/tracker';
import { daysSinceApplied, isFollowUpDue } from '@/lib/tracker-follow-up';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key, locale: 'en' }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));
vi.mock('@/lib/api/tracker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/tracker')>()),
  getApplicationDetail: vi.fn(),
  updateApplication: vi.fn(),
  draftFollowUp: vi.fn(),
}));
const statusCache = vi.hoisted(() => ({
  agentMode: false,
  state: 'loaded' as 'loaded' | 'loading' | 'failed',
}));
vi.mock('@/lib/context/status-cache', () => ({
  useOptionalStatusCache: () => ({
    status: statusCache.state === 'loaded' ? { agent_mode: statusCache.agentMode } : null,
    isLoading: statusCache.state === 'loading',
  }),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString();

const card = (overrides: Partial<Application> = {}): Application => ({
  application_id: 'a1',
  job_id: 'j1',
  resume_id: 'r1',
  master_resume_id: null,
  status: 'applied',
  company: 'ACME',
  role: 'Engineer',
  applied_at: daysAgo(10),
  notes: null,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const detail = (overrides: Partial<Application> = {}): ApplicationDetail => ({
  ...card(overrides),
  job_content: 'Build things.',
  resume: { resume_id: 'r1' },
});

describe('isFollowUpDue', () => {
  const now = new Date('2026-11-11T12:00:00Z');

  it('turns due exactly 7 days after applying', () => {
    expect(isFollowUpDue({ status: 'applied', applied_at: '2026-11-04T12:00:00Z' }, now)).toBe(
      true
    );
    expect(isFollowUpDue({ status: 'applied', applied_at: '2026-11-04T12:00:01Z' }, now)).toBe(
      false
    );
  });

  it('applies only to cards still in Applied', () => {
    const longAgo = '2026-10-01T00:00:00Z';
    expect(isFollowUpDue({ status: 'no_response', applied_at: longAgo }, now)).toBe(false);
    expect(isFollowUpDue({ status: 'interview', applied_at: longAgo }, now)).toBe(false);
  });

  it('is never due without a readable applied date', () => {
    expect(isFollowUpDue({ status: 'applied', applied_at: null }, now)).toBe(false);
    expect(isFollowUpDue({ status: 'applied', applied_at: 'not a date' }, now)).toBe(false);
  });

  it('counts whole days', () => {
    expect(daysSinceApplied('2026-11-01T13:00:00Z', now)).toBe(9);
    expect(daysSinceApplied('2026-11-12T00:00:00Z', now)).toBe(0);
  });
});

describe('ApplicationCard follow-up marker', () => {
  const renderCard = (application: Application) =>
    render(
      <ApplicationCard
        application={application}
        selected={false}
        sharedResume={false}
        onToggleSelect={vi.fn()}
        onOpen={vi.fn()}
      />
    );

  it('marks an Applied card with no reply for 7+ days', () => {
    renderCard(card({ applied_at: daysAgo(10) }));
    expect(screen.getByText('tracker.followUp.due')).toBeInTheDocument();
  });

  it('leaves recent and moved-on cards unmarked', () => {
    renderCard(card({ applied_at: daysAgo(3) }));
    renderCard(card({ status: 'interview', applied_at: daysAgo(30) }));
    expect(screen.queryByText('tracker.followUp.due')).not.toBeInTheDocument();
  });
});

describe('CardDetailModal follow-up', () => {
  const onUpdated = vi.fn();
  const openModal = async (application: ApplicationDetail) => {
    vi.mocked(getApplicationDetail).mockResolvedValue(application);
    render(
      <CardDetailModal applicationId="a1" open onOpenChange={vi.fn()} onUpdated={onUpdated} />
    );
    await screen.findByText('tracker.modal.jobDescription');
  };

  beforeEach(() => {
    statusCache.agentMode = false;
    statusCache.state = 'loaded';
    vi.mocked(draftFollowUp).mockReset();
    vi.mocked(updateApplication).mockReset();
    onUpdated.mockReset();
  });

  it('drafts a follow-up email and shows it for editing', async () => {
    vi.mocked(draftFollowUp).mockResolvedValue('Subject: Engineer application\n\nHello,');
    await openModal(detail());

    fireEvent.click(screen.getByRole('button', { name: 'tracker.followUp.draft' }));

    const draft = await screen.findByLabelText('tracker.followUp.draftLabel');
    expect(draft).toHaveValue('Subject: Engineer application\n\nHello,');
    expect(draftFollowUp).toHaveBeenCalledWith('a1');
    expect(screen.getByRole('button', { name: 'tracker.followUp.copy' })).toBeInTheDocument();
  });

  it('shows a generic message when drafting fails', async () => {
    vi.mocked(draftFollowUp).mockRejectedValue(new Error('provider said sk-secret-123'));
    await openModal(detail());

    fireEvent.click(screen.getByRole('button', { name: 'tracker.followUp.draft' }));

    expect(await screen.findByText('tracker.followUp.failed')).toBeInTheDocument();
    expect(screen.queryByText(/sk-secret/)).not.toBeInTheDocument();
  });

  it('points to the coding agent instead of drafting in agent mode', async () => {
    statusCache.agentMode = true;
    await openModal(detail());

    expect(
      screen.queryByRole('button', { name: 'tracker.followUp.draft' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('tracker.followUp.agentHint')).toBeInTheDocument();
  });

  it('moves an Applied card to No Response', async () => {
    vi.mocked(updateApplication).mockResolvedValue(card({ status: 'no_response' }));
    await openModal(detail());

    fireEvent.click(screen.getByRole('button', { name: 'tracker.followUp.moveToNoResponse' }));

    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(updateApplication).toHaveBeenCalledWith('a1', { status: 'no_response' });
  });

  it('offers no follow-up once the card has moved on', async () => {
    await openModal(detail({ status: 'interview' }));

    expect(
      screen.queryByRole('button', { name: 'tracker.followUp.draft' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'tracker.followUp.moveToNoResponse' })
    ).not.toBeInTheDocument();
  });

  it('keeps drafting disabled until the mode is known', async () => {
    statusCache.state = 'loading';
    await openModal(detail());

    expect(screen.getByRole('button', { name: 'tracker.followUp.draft' })).toBeDisabled();
  });

  it('a move that finishes after switching cards leaves the new card alone', async () => {
    let finishMove: (value: Application) => void = () => {};
    vi.mocked(updateApplication).mockReturnValue(
      new Promise((resolve) => {
        finishMove = resolve;
      })
    );
    vi.mocked(getApplicationDetail).mockImplementation(async (id: string) =>
      id === 'a1' ? detail() : detail({ application_id: 'a2', company: 'Globex' })
    );
    const { rerender } = render(
      <CardDetailModal applicationId="a1" open onOpenChange={vi.fn()} onUpdated={onUpdated} />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'tracker.followUp.moveToNoResponse' })
    );

    rerender(
      <CardDetailModal applicationId="a2" open onOpenChange={vi.fn()} onUpdated={onUpdated} />
    );
    await screen.findByText('Globex');
    finishMove(card({ status: 'no_response' }));

    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(
      screen.getByRole('button', { name: 'tracker.followUp.moveToNoResponse' })
    ).toBeInTheDocument();
  });

  it('lets the user draft if the status request failed', async () => {
    statusCache.state = 'failed';
    await openModal(detail());

    expect(screen.getByRole('button', { name: 'tracker.followUp.draft' })).toBeEnabled();
  });

  it('shows progress while moving, then a generic message if the move fails', async () => {
    let failMove: (error: Error) => void = () => {};
    vi.mocked(updateApplication).mockReturnValue(
      new Promise((_resolve, reject) => {
        failMove = reject;
      })
    );
    await openModal(detail());

    fireEvent.click(screen.getByRole('button', { name: 'tracker.followUp.moveToNoResponse' }));
    expect(await screen.findByRole('button', { name: 'tracker.followUp.moving' })).toBeDisabled();
    failMove(new Error('provider said sk-secret-123'));

    expect(await screen.findByText('tracker.errors.moveFailed')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
    expect(screen.queryByText(/sk-secret/)).not.toBeInTheDocument();
  });

  it('offers a draft but no move for a card already in No Response', async () => {
    await openModal(detail({ status: 'no_response' }));

    expect(screen.getByRole('button', { name: 'tracker.followUp.draft' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'tracker.followUp.moveToNoResponse' })
    ).not.toBeInTheDocument();
  });
});
