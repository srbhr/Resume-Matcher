import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '@/components/tracker/kanban-board';
import {
  APPLICATION_STATUS_ORDER,
  type Application,
  type ApplicationColumns,
} from '@/lib/api/tracker';
import {
  TRACKER_VISIBILITY_STORAGE_KEY,
  saveTrackerHiddenStatuses,
} from '@/lib/utils/tracker-visibility-storage';

const apiMocks = vi.hoisted(() => ({
  listApplications: vi.fn(),
  updateApplication: vi.fn(),
  bulkUpdateStatus: vi.fn(),
  bulkDeleteApplications: vi.fn(),
}));

vi.mock('@/lib/api/tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/tracker')>();
  return { ...actual, ...apiMocks };
});

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params?.count ? `${key}:${params.count}` : key,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function application(status: Application['status']): Application {
  return {
    application_id: 'application-1',
    job_id: 'job-1',
    resume_id: 'resume-1',
    master_resume_id: null,
    status,
    company: 'Acme',
    role: 'Engineer',
    applied_at: null,
    notes: null,
    position: 0,
    created_at: '2026-08-04T00:00:00Z',
    updated_at: '2026-08-04T00:00:00Z',
  };
}

function columnsWithSavedApplication(): ApplicationColumns {
  return {
    saved: [application('saved')],
    applied: [],
    no_response: [],
    response: [],
    interview: [],
    accepted: [],
    rejected: [],
  };
}

describe('KanbanBoard status visibility', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMocks.listApplications.mockReset();
    apiMocks.listApplications.mockResolvedValue({ columns: columnsWithSavedApplication() });
  });

  it('loads the saved preference and hides only the selected status module', async () => {
    saveTrackerHiddenStatuses(['saved']);

    render(<KanbanBoard />);

    await screen.findByRole('heading', { name: 'tracker.columns.applied' });
    expect(
      screen.queryByRole('heading', { name: 'tracker.columns.saved' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
  });

  it('persists a toggle immediately and restores the existing card when shown again', async () => {
    render(<KanbanBoard />);
    await screen.findByText('Acme');

    fireEvent.click(screen.getByRole('button', { name: 'tracker.manage.button' }));
    fireEvent.click(screen.getByRole('switch', { name: 'tracker.columns.saved' }));

    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(TRACKER_VISIBILITY_STORAGE_KEY) ?? '')).toEqual({
      version: 1,
      hiddenStatuses: ['saved'],
    });

    fireEvent.click(screen.getByRole('switch', { name: 'tracker.columns.saved' }));

    expect(await screen.findByText('Acme')).toBeInTheDocument();
  });

  it('shows a recoverable message when every status is hidden', async () => {
    saveTrackerHiddenStatuses(APPLICATION_STATUS_ORDER);

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('tracker.manage.allHidden')).toBeInTheDocument();
    });
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tracker.manage.button' })).toBeInTheDocument();
  });
});
