import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '@/app/(default)/dashboard/page';

const list = vi.fn();
const get = vi.fn();
const remove = vi.fn();
const translate = (key: string, params?: { status?: string }) =>
  params?.status ? `${key}:${params.status}` : key;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: translate,
    locale: 'en',
  }),
}));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: { llm_configured: true },
    isLoading: false,
    incrementResumes: vi.fn(),
    decrementResumes: vi.fn(),
    setHasMasterResume: vi.fn(),
  }),
}));
vi.mock('@/lib/api/resume', () => ({
  fetchResumeList: (...args: unknown[]) => list(...args),
  fetchResume: (...args: unknown[]) => get(...args),
  deleteResume: (...args: unknown[]) => remove(...args),
  retryProcessing: vi.fn(),
  fetchJobDescription: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/components/dashboard/resume-upload-dialog', () => ({ ResumeUploadDialog: () => null }));
vi.mock('@/components/dashboard/master-resume-choice-dialog', () => ({
  MasterResumeChoiceDialog: () => null,
}));

const row = (id: string, master = false) => ({
  resume_id: id,
  title: id,
  filename: `${id}.pdf`,
  is_master: master,
  processing_status: 'ready',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  parent_id: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  get.mockResolvedValue({
    processed_resume: { personalInfo: { name: 'Ada' } },
    raw_resume: { processing_status: 'ready' },
  });
});

describe('dashboard recoverable errors', () => {
  it('ignores a failed delete after the active master changes', async () => {
    let rejectDelete!: (error: Error) => void;
    remove.mockReturnValue(
      new Promise((_, reject) => {
        rejectDelete = reject;
      })
    );
    list.mockResolvedValueOnce([row('old', true)]).mockResolvedValue([row('new', true)]);
    get.mockResolvedValue({ processed_resume: null, raw_resume: { processing_status: 'failed' } });
    render(<Dashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'dashboard.deleteAndReupload' }));
    await act(async () =>
      within(screen.getByRole('dialog'))
        .getByRole('button', { name: 'dashboard.deleteAndReupload' })
        .click()
    );
    fireEvent.focus(window);
    await act(async () => {});
    expect(localStorage.getItem('master_resume_id')).toBe('new');
    await act(async () => rejectDelete(new Error('old delete failed')));
    expect(screen.queryByText('dashboard.errors.deleteFailed')).toBeNull();
    expect(localStorage.getItem('master_resume_id')).toBe('new');
  });

  it.each([
    new Error('server 500'),
    new Error('Request timed out'),
    new TypeError('Failed to fetch'),
  ])('distinguishes %s from a successfully empty account and retries', async (failure) => {
    list.mockRejectedValueOnce(failure).mockResolvedValue([]);
    render(<Dashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('dashboard.errors.loadFailed');
    expect(screen.queryByRole('button', { name: 'dashboard.initializeMasterResume' })).toBeNull();

    await act(async () => screen.getByRole('button', { name: 'common.retry' }).click());

    expect(
      await screen.findByRole('button', { name: 'dashboard.initializeMasterResume' })
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retains the master and offers retry after delete-and-reupload fails', async () => {
    list.mockResolvedValue([row('master', true)]);
    get.mockResolvedValue({
      processed_resume: null,
      raw_resume: { processing_status: 'failed' },
    });
    remove.mockRejectedValueOnce(new Error('delete failed')).mockResolvedValue(undefined);
    render(<Dashboard />);
    const deleteButton = await screen.findByRole('button', {
      name: 'dashboard.deleteAndReupload',
    });
    fireEvent.click(deleteButton);
    await act(async () =>
      within(screen.getByRole('dialog'))
        .getByRole('button', { name: 'dashboard.deleteAndReupload' })
        .click()
    );

    expect(localStorage.getItem('master_resume_id')).toBe('master');
    expect(screen.getByText('dashboard.errors.deleteFailed')).toBeInTheDocument();
    await act(async () => screen.getByRole('button', { name: 'common.retry' }).click());
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

it('keeps existing master controls available when a list refresh fails', async () => {
  list.mockResolvedValueOnce([row('master', true)]).mockRejectedValue(new Error('offline'));
  get.mockResolvedValue({ processed_resume: null, raw_resume: { processing_status: 'failed' } });
  render(<Dashboard />);
  await screen.findByRole('button', { name: 'dashboard.deleteAndReupload' });
  fireEvent.focus(window);
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'dashboard.deleteAndReupload' })).toBeInTheDocument();
});
