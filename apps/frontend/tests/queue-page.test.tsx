import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QueuePage from '@/app/(default)/queue/page';
import { QueueItemInProgressError, type QueueItem } from '@/lib/api/resume';

const listResumes = vi.fn();
const fetchQueue = vi.fn();
const addJob = vi.fn();
const removeItem = vi.fn();
const clearItems = vi.fn();
const parseMetadata = vi.fn();

const translate = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${Object.values(params).join(',')}` : key;

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: translate, locale: 'en' }) }));
const systemStatus = vi.hoisted(() => ({ loading: false }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: systemStatus.loading ? null : { llm_configured: true },
    isLoading: systemStatus.loading,
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
  QueueItemInProgressError: class QueueItemInProgressError extends Error {},
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
  // Drop queued one-off results a failed test may leave behind.
  for (const fn of [listResumes, fetchQueue, addJob, removeItem, clearItems, parseMetadata]) {
    fn.mockReset();
  }
  localStorage.clear();
  systemStatus.loading = false;
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

describe('queue list states', () => {
  it('shows loading, not "empty", while the first read is pending', async () => {
    const first = deferred<QueueItem[]>();
    fetchQueue.mockReturnValueOnce(first.promise);
    render(<QueuePage />);
    await waitFor(() => expect(fetchQueue).toHaveBeenCalled());
    expect(screen.getByText('common.loading')).toBeTruthy();
    expect(screen.queryByText('queue.monitor.emptyTitle')).toBeNull();

    await act(async () => first.resolve([]));
    expect(screen.getByText('queue.monitor.emptyTitle')).toBeTruthy();
  });

  it('reports a failed read instead of an empty queue, and retries', async () => {
    fetchQueue
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([item('back', 'completed')]);
    render(<QueuePage />);

    expect(await screen.findByText('queue.errors.loadFailed')).toBeTruthy();
    expect(screen.queryByText('queue.monitor.emptyTitle')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(await screen.findByText('back role')).toBeTruthy();
    expect(screen.queryByText('queue.errors.loadFailed')).toBeNull();
  });
});

describe('queue polling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const flush = () => act(async () => {});
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it('polls on one steady interval while items are active and stops when none are', async () => {
    vi.useFakeTimers();
    // Reads that take a second: re-creating the interval per snapshot would delay each tick.
    const slowRead = (items: QueueItem[]) => () =>
      new Promise<QueueItem[]>((resolve) => setTimeout(() => resolve(items), 1000));
    fetchQueue
      .mockResolvedValueOnce([item('a', 'pending')])
      .mockImplementationOnce(slowRead([item('a', 'processing')]))
      .mockImplementationOnce(slowRead([item('a', 'processing')]))
      .mockImplementation(slowRead([item('a', 'completed')]));
    render(<QueuePage />);
    await flush();
    await flush();
    expect(fetchQueue).toHaveBeenCalledTimes(1);

    // Each read lands a second after its tick; the next tick stays 2.5s after the last.
    await advance(2500);
    expect(fetchQueue).toHaveBeenCalledTimes(2);
    await advance(1000);
    await advance(1500);
    expect(fetchQueue).toHaveBeenCalledTimes(3);
    await advance(1000);
    await advance(1500);
    expect(fetchQueue).toHaveBeenCalledTimes(4);
    await advance(1000); // the completed snapshot lands
    await advance(25_000);
    expect(fetchQueue).toHaveBeenCalledTimes(4);
  });

  it('stops polling after a failed read until the user retries', async () => {
    vi.useFakeTimers();
    fetchQueue
      .mockResolvedValueOnce([item('a', 'processing')])
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<QueuePage />);
    await flush();
    await flush();
    await advance(2500);
    expect(fetchQueue).toHaveBeenCalledTimes(2);
    expect(screen.getByText('queue.errors.loadFailed')).toBeTruthy();

    await advance(60_000);
    expect(fetchQueue).toHaveBeenCalledTimes(2);
  });
});

describe('queue actions', () => {
  it('explains a failed delete and keeps the item', async () => {
    fetchQueue.mockResolvedValue([item('a', 'failed')]);
    removeItem.mockRejectedValue(new Error('Failed to delete queue item (500)'));
    render(<QueuePage />);
    const row = (await screen.findByText('a role')).closest('li')!;
    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: 'queue.monitor.remove' }));
    });
    expect(screen.getByText('queue.errors.deleteFailed')).toBeTruthy();
    expect(screen.getByText('a role')).toBeTruthy();
  });

  it('says when the job started tailoring and refreshes its row', async () => {
    fetchQueue
      .mockResolvedValueOnce([item('a', 'pending')])
      .mockResolvedValue([item('a', 'processing')]);
    removeItem.mockRejectedValue(new QueueItemInProgressError('busy'));
    render(<QueuePage />);
    const row = (await screen.findByText('a role')).closest('li')!;
    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: 'queue.monitor.remove' }));
    });
    expect(screen.getByText('queue.errors.deleteInProgress')).toBeTruthy();
    expect(await screen.findByText('queue.status.processing')).toBeTruthy();
  });

  it('explains a failed clear and keeps the list', async () => {
    fetchQueue.mockResolvedValue([item('a', 'completed')]);
    clearItems.mockRejectedValue(new Error('Failed to clear queue (500)'));
    render(<QueuePage />);
    await screen.findByText('a role');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'queue.monitor.clearCompleted' }));
    });
    expect(screen.getByText('queue.errors.clearFailed')).toBeTruthy();
    expect(screen.getByText('a role')).toBeTruthy();
  });
});

describe('detected job details', () => {
  const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
  const describeJob = (text: string) =>
    fireEvent.change(screen.getByLabelText('queue.form.jobDescriptionLabel'), {
      target: { value: text },
    });

  it("replaces the previous job's details but keeps what the user typed", async () => {
    parseMetadata
      .mockResolvedValueOnce({ role: 'Staff Engineer', company: 'Acme', job_req_id: 'R1' })
      .mockResolvedValueOnce({ role: 'Designer', company: '', job_req_id: '' });
    render(<QueuePage />);
    await screen.findByText('Backend track');

    describeJob(JOB_DESCRIPTION);
    await waitFor(() => expect(field('queue.form.companyLabel').value).toBe('Acme'));
    fireEvent.change(field('queue.form.roleLabel'), { target: { value: 'My title' } });

    describeJob('Product Designer\nWe are a small studio hiring a designer to join us.');
    await waitFor(() => expect(parseMetadata).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(field('queue.form.companyLabel').value).toBe(''));
    expect(field('queue.form.jobReqIdLabel').value).toBe('');
    expect(field('queue.form.roleLabel').value).toBe('My title');
  });
});

describe('cooldown', () => {
  it.each([
    ['300', 60],
    ['-5', 0],
    ['', 0],
    ['12.5', 12.5],
  ])('keeps %s within the 0-60 seconds the backend accepts', async (typed, expected) => {
    addJob.mockResolvedValue(item('new', 'pending'));
    render(<QueuePage />);
    await screen.findByText('Backend track');
    fireEvent.change(screen.getByLabelText('queue.form.cooldownLabel'), {
      target: { value: typed },
    });
    expect((screen.getByLabelText('queue.form.cooldownLabel') as HTMLInputElement).value).toBe(
      String(expected)
    );
    fireEvent.change(screen.getByLabelText('queue.form.jobDescriptionLabel'), {
      target: { value: JOB_DESCRIPTION },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'queue.form.submit' }));
    });
    expect(addJob.mock.calls[0][2]).toBe(expected);
  });
});

describe('clearing', () => {
  it("clears only the selected master resume's jobs", async () => {
    fetchQueue.mockResolvedValue([item('a', 'completed'), item('b', 'failed')]);
    clearItems.mockResolvedValue(undefined);
    render(<QueuePage />);
    await screen.findByText('a role');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'queue.monitor.clearCompleted' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'queue.monitor.clearAll' }));
    });
    expect(clearItems.mock.calls).toEqual([['m1', 'completed'], ['m1']]);
  });
});

describe('provider status', () => {
  it('says it is checking, not that a key is missing, while the status loads', async () => {
    systemStatus.loading = true;
    render(<QueuePage />);
    await screen.findByText('Backend track');
    const add = screen.getByRole('button', { name: 'common.checking' });
    expect(add).toBeDisabled();
    expect(screen.queryByText('tailor.configureApiKeyFirst')).toBeNull();
  });
});
