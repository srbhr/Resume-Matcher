import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QueuePage from '@/app/(default)/queue/page';
import type { QueueItem } from '@/lib/api/resume';

const listResumes = vi.fn();
const fetchQueue = vi.fn();
const addJob = vi.fn();
const removeItem = vi.fn();
const clearItems = vi.fn();
const parseMetadata = vi.fn();

const translate = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${Object.values(params).join(',')}` : key;

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: translate, locale: 'en' }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: { llm_configured: true },
    isLoading: false,
    incrementJobs: vi.fn(),
  }),
}));
vi.mock('@/lib/api/config', () => ({
  fetchPromptConfig: vi.fn().mockResolvedValue({
    default_prompt_id: 'keywords',
    prompt_options: [{ id: 'keywords' }, { id: 'nudge' }],
  }),
}));
vi.mock('@/lib/api/resume', () => ({
  fetchResumeList: (...args: unknown[]) => listResumes(...args),
  fetchJobQueue: (...args: unknown[]) => fetchQueue(...args),
  addJobToQueue: (...args: unknown[]) => addJob(...args),
  deleteQueueItem: (...args: unknown[]) => removeItem(...args),
  clearQueueItems: (...args: unknown[]) => clearItems(...args),
  parseJobMetadata: (...args: unknown[]) => parseMetadata(...args),
}));

const JOB_DESCRIPTION =
  'Job Title: Staff Engineer\nCompany: Acme\nBuild payment systems with Python and Postgres.';

const item = (id: string, status: QueueItem['status'], extra: Partial<QueueItem> = {}) =>
  ({
    item_id: id,
    resume_id: 'm1',
    job_description_snippet: `${id} snippet`,
    role: `${id} role`,
    company: 'Acme',
    job_req_id: '',
    status,
    tailored_resume_id: null,
    title: null,
    job_id: null,
    error: null,
    rate_limit_seconds: 5,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...extra,
  }) satisfies QueueItem;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  listResumes.mockResolvedValue([
    {
      resume_id: 'm1',
      title: 'Backend track',
      filename: 'cv.pdf',
      is_master: true,
      is_default_master: true,
      processing_status: 'ready',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      parent_id: null,
    },
  ]);
  fetchQueue.mockResolvedValue([]);
  parseMetadata.mockResolvedValue({ role: '', company: '', job_req_id: '' });
});

describe('queue page', () => {
  it('shows each item with a translated status, its failure and a link to the result', async () => {
    fetchQueue.mockResolvedValue([
      item('done', 'completed', { tailored_resume_id: 't1', title: 'Staff @ Acme' }),
      item('broken', 'failed', { error: 'timeout' }),
      item('odd', 'failed', { error: 'something unexpected' }),
    ]);
    render(<QueuePage />);

    const done = (await screen.findByText('Staff @ Acme')).closest('li')!;
    expect(within(done).getByText('queue.status.completed')).toBeTruthy();
    expect(
      within(done).getByRole('link', { name: 'queue.monitor.viewResume' }).getAttribute('href')
    ).toBe('/resumes/t1');
    const broken = screen.getByText('broken role').closest('li')!;
    expect(within(broken).getByText('queue.errors.item.timeout')).toBeTruthy();
    const odd = screen.getByText('odd role').closest('li')!;
    expect(within(odd).getByText('queue.errors.item.failed')).toBeTruthy();
  });

  it('fills detected details and queues the job with the chosen settings', async () => {
    parseMetadata.mockResolvedValue({ role: 'Staff Engineer', company: 'Acme', job_req_id: '' });
    addJob.mockResolvedValue(item('new', 'pending'));
    render(<QueuePage />);
    await screen.findByText('Backend track');

    fireEvent.change(screen.getByLabelText('queue.form.jobDescriptionLabel'), {
      target: { value: JOB_DESCRIPTION },
    });
    await waitFor(() =>
      expect((screen.getByLabelText('queue.form.roleLabel') as HTMLInputElement).value).toBe(
        'Staff Engineer'
      )
    );
    expect(parseMetadata).toHaveBeenCalledWith(JOB_DESCRIPTION);
    fireEvent.change(screen.getByLabelText('queue.form.jobReqIdLabel'), {
      target: { value: 'REQ-1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'queue.form.submit' }));
    });

    expect(addJob).toHaveBeenCalledWith(
      'm1',
      JOB_DESCRIPTION,
      5,
      'Staff Engineer',
      'Acme',
      'REQ-1',
      'keywords'
    );
    expect(await screen.findByText('queue.form.added')).toBeTruthy();
    expect(screen.getByText('new role')).toBeTruthy();
    expect(
      (screen.getByLabelText('queue.form.jobDescriptionLabel') as HTMLTextAreaElement).value
    ).toBe('');
  });

  it('refuses a description too short to tailor without calling the API', async () => {
    render(<QueuePage />);
    await screen.findByText('Backend track');
    fireEvent.change(screen.getByLabelText('queue.form.jobDescriptionLabel'), {
      target: { value: 'Too short' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'queue.form.submit' }));
    });
    expect(screen.getByText('tailor.errors.jobDescriptionTooShort')).toBeTruthy();
    expect(addJob).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('queue reads', () => {
  it('waits for the master resume before the first read', async () => {
    const masters = deferred<unknown[]>();
    listResumes.mockReturnValue(masters.promise);
    render(<QueuePage />);
    await act(async () => {});
    expect(fetchQueue).not.toHaveBeenCalled();

    await act(async () =>
      masters.resolve([
        {
          resume_id: 'm1',
          title: 'Backend track',
          is_master: true,
          is_default_master: true,
          processing_status: 'ready',
        },
      ])
    );
    await waitFor(() => expect(fetchQueue).toHaveBeenCalled());
    expect(fetchQueue.mock.calls.every(([resumeId]) => resumeId === 'm1')).toBe(true);
  });

  it('ignores a read that a newer read superseded', async () => {
    const slow = deferred<QueueItem[]>();
    fetchQueue
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce([item('fresh', 'completed')]);
    render(<QueuePage />);
    await waitFor(() => expect(fetchQueue).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'queue.monitor.refresh' }));
    expect(await screen.findByText('fresh role')).toBeTruthy();
    await act(async () => slow.resolve([item('stale', 'completed')]));

    expect(screen.queryByText('stale role')).toBeNull();
    expect(screen.getByText('fresh role')).toBeTruthy();
  });

  it('does not restore an item deleted while an older read was in flight', async () => {
    fetchQueue.mockResolvedValueOnce([item('a', 'completed'), item('b', 'completed')]);
    render(<QueuePage />);
    const row = (await screen.findByText('a role')).closest('li')!;

    const inFlight = deferred<QueueItem[]>();
    fetchQueue.mockReturnValueOnce(inFlight.promise);
    fireEvent.click(screen.getByRole('button', { name: 'queue.monitor.refresh' }));
    removeItem.mockResolvedValue(undefined);
    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: 'queue.monitor.remove' }));
    });
    expect(screen.queryByText('a role')).toBeNull();

    await act(async () => inFlight.resolve([item('a', 'completed'), item('b', 'completed')]));
    expect(screen.queryByText('a role')).toBeNull();
    expect(screen.getByText('b role')).toBeTruthy();
  });
});
