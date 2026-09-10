import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Dashboard from '@/app/(default)/dashboard/page';
import type { fetchResume, ResumeListItem } from '@/lib/api/resume';

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), retry: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: { status?: string }) =>
      params?.status ? `${key}:${params.status}` : key,
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
  fetchResumeList: (...args: unknown[]) => api.list(...args),
  fetchResume: (...args: unknown[]) => api.get(...args),
  deleteResume: vi.fn(),
  retryProcessing: (...args: unknown[]) => api.retry(...args),
  fetchJobDescription: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/components/dashboard/resume-upload-dialog', () => ({
  ResumeUploadDialog: ({ onUploadComplete }: { onUploadComplete: (id: string) => void }) => (
    <button onClick={() => onUploadComplete('uploaded')}>finish upload</button>
  ),
}));
vi.mock('@/components/dashboard/master-resume-choice-dialog', () => ({
  MasterResumeChoiceDialog: () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function row(id: string, master = false): ResumeListItem {
  return {
    resume_id: id,
    title: id,
    filename: `${id}.pdf`,
    is_master: master,
    processing_status: 'ready',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    parent_id: null,
  };
}

type ResumeResponse = Awaited<ReturnType<typeof fetchResume>>;
function status(
  value: ResumeResponse['raw_resume']['processing_status'] = 'ready'
): ResumeResponse {
  return {
    resume_id: 'master',
    processed_resume: { personalInfo: { name: 'Ada' } },
    raw_resume: {
      id: 1,
      content: 'Ada',
      content_type: 'text/plain',
      created_at: '2026-01-01',
      processing_status: value,
    },
  };
}

async function exhaustProcessingPolls(): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    await act(async () => vi.advanceTimersByTimeAsync(30000));
  }
}

describe('dashboard refresh ownership', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    api.get.mockResolvedValue(status());
  });
  afterEach(() => vi.useRealTimers());

  it('keeps the newer focus refresh when the mount list resolves last', async () => {
    const old = deferred<ResumeListItem[]>();
    const fresh = deferred<ResumeListItem[]>();
    api.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    render(<Dashboard />);
    fireEvent.focus(window);
    await act(async () => fresh.resolve([row('new-master', true), row('new-card')]));
    await act(async () => old.resolve([row('old-master', true), row('old-card')]));
    expect(localStorage.getItem('master_resume_id')).toBe('new-master');
    expect(screen.getByText('new-card')).toBeInTheDocument();
    expect(screen.queryByText('old-card')).not.toBeInTheDocument();
  });

  it('does not clear the current master when the previous master returns 404', async () => {
    const old = deferred<ResumeResponse>();
    localStorage.setItem('master_resume_id', 'old');
    api.get.mockImplementation((id: string) =>
      id === 'old' ? old.promise : Promise.resolve(status())
    );
    api.list.mockResolvedValue([row('new', true)]);
    render(<Dashboard />);
    await act(async () => {});
    await act(async () => old.reject(new Error('404 old resume missing')));
    expect(localStorage.getItem('master_resume_id')).toBe('new');
    expect(screen.getByText('dashboard.statusLine:dashboard.status.ready')).toBeInTheDocument();
  });

  it('ignores an older status response for the same master', async () => {
    const old = deferred<ResumeResponse>();
    api.list.mockResolvedValue([row('master', true)]);
    api.get.mockReturnValueOnce(old.promise).mockResolvedValue(status());
    render(<Dashboard />);
    await act(async () => {});
    fireEvent.focus(window);
    await act(async () => {});
    await act(async () => old.resolve(status('failed')));
    expect(screen.getByText('dashboard.statusLine:dashboard.status.ready')).toBeInTheDocument();
  });

  it('does not write storage from a list response after unmount', async () => {
    const old = deferred<ResumeListItem[]>();
    api.list.mockReturnValue(old.promise);
    const view = render(<Dashboard />);
    view.unmount();
    await act(async () => old.resolve([row('old', true)]));
    expect(localStorage.getItem('master_resume_id')).toBeNull();
  });

  it('polls pending processing serially and stops when ready', async () => {
    vi.useFakeTimers();
    const pending = deferred<ResumeResponse>();
    api.list.mockResolvedValue([row('master', true)]);
    api.get
      .mockResolvedValueOnce(status('pending'))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(status());
    render(<Dashboard />);
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(api.get).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(api.get).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(status()));
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(screen.getByText('dashboard.statusLine:dashboard.status.ready')).toBeInTheDocument();
  });

  it('rejects a queued poll for a previous master before invalidating the active status', async () => {
    vi.useFakeTimers();
    const timers = vi.spyOn(window, 'setTimeout');
    const fresh = deferred<ResumeResponse>();
    api.list.mockResolvedValueOnce([row('old', true)]).mockResolvedValue([row('new', true)]);
    api.get.mockImplementation((id: string) =>
      id === 'new' ? fresh.promise : Promise.resolve(status('pending'))
    );
    render(<Dashboard />);
    await act(async () => {});
    const oldPoll = timers.mock.calls.find(([, delay]) => delay === 3000)?.[0];
    if (typeof oldPoll !== 'function') throw new Error('Expected a pending-processing poll');
    fireEvent.focus(window);
    await act(async () => {});
    // A callback already queued for dispatch can outlive its timer cleanup.
    await act(async () => {
      oldPoll();
    });
    await act(async () => fresh.resolve(status()));
    expect(api.get.mock.calls.filter(([id]) => id === 'old')).toHaveLength(1);
    expect(screen.getByText('dashboard.statusLine:dashboard.status.ready')).toBeInTheDocument();
    timers.mockRestore();
  });
  it('keeps a pending retry owned across focus refreshes', async () => {
    const pending = deferred<unknown>();
    api.list.mockResolvedValue([row('master', true)]);
    api.get.mockResolvedValue(status('failed'));
    api.retry.mockReturnValue(pending.promise);
    render(<Dashboard />);
    await act(async () => {});
    fireEvent.click(screen.getAllByRole('button', { name: 'dashboard.retryProcessing' })[0]);
    fireEvent.focus(window);
    await act(async () => {});
    expect(
      screen
        .queryAllByRole('button', { name: 'dashboard.retryProcessing' })
        .every((button) => button.hasAttribute('disabled'))
    ).toBe(true);
    await act(async () => pending.resolve({ processing_status: 'ready' }));
    expect(screen.getByText('dashboard.statusLine:dashboard.status.ready')).toBeInTheDocument();
  });

  it('rejects a queued poll when a same-master refresh has already begun', async () => {
    vi.useFakeTimers();
    const timers = vi.spyOn(window, 'setTimeout');
    const fresh = deferred<ResumeResponse>();
    api.list.mockResolvedValue([row('master', true)]);
    api.get
      .mockResolvedValueOnce(status('pending'))
      .mockReturnValueOnce(fresh.promise)
      .mockResolvedValue(status('failed'));
    render(<Dashboard />);
    await act(async () => {});
    const poll = timers.mock.calls.find(([, delay]) => delay === 3000)?.[0];
    if (typeof poll !== 'function') throw new Error('Expected poll');
    fireEvent.focus(window);
    await act(async () => {});
    await act(async () => poll());
    await act(async () => fresh.resolve(status()));
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(screen.getByText('dashboard.statusLine:dashboard.status.ready')).toBeInTheDocument();
    timers.mockRestore();
  });

  it('backs off and eventually stops polling a stuck job without reporting it failed', async () => {
    vi.useFakeTimers();
    api.list.mockResolvedValue([row('master', true)]);
    api.get.mockResolvedValue(status('processing'));
    render(<Dashboard />);
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    const count = api.get.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(api.get).toHaveBeenCalledTimes(count);
    for (let i = 0; i < 20; i++) await act(async () => vi.advanceTimersByTimeAsync(30000));
    const stopped = api.get.mock.calls.length;
    for (let i = 0; i < 5; i++) await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(api.get).toHaveBeenCalledTimes(stopped);
    expect(stopped).toBeLessThanOrEqual(13);
    expect(
      screen.getByText('dashboard.statusLine:dashboard.status.processing')
    ).toBeInTheDocument();
  });

  it('refreshes the grid after upload invalidates an older in-flight list', async () => {
    const old = deferred<ResumeListItem[]>();
    api.list
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue([row('uploaded', true), row('fresh-card')]);
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'finish upload' }));
    await act(async () => {});
    expect(screen.getByText('fresh-card')).toBeInTheDocument();
    await act(async () => old.resolve([row('stale-card')]));
    expect(screen.queryByText('stale-card')).not.toBeInTheDocument();
  });

  it.each(['processing', 'pending'] as const)(
    'restarts a capped observation window after retry returns %s',
    async (processing_status) => {
      vi.useFakeTimers();
      const retry = deferred<unknown>();
      api.list.mockResolvedValue([row('master', true)]);
      api.get.mockResolvedValue(status('processing'));
      api.retry.mockReturnValue(retry.promise);
      render(<Dashboard />);
      await act(async () => {});
      await exhaustProcessingPolls();
      expect(api.get).toHaveBeenCalledTimes(13);

      fireEvent.click(screen.getAllByRole('button', { name: 'dashboard.retryProcessing' })[0]);
      await act(async () => vi.advanceTimersByTimeAsync(30000));
      expect(api.get).toHaveBeenCalledTimes(13);
      await act(async () => retry.resolve({ processing_status }));
      api.get.mockResolvedValue(status('ready'));
      await act(async () => vi.advanceTimersByTimeAsync(2999));
      expect(api.get).toHaveBeenCalledTimes(13);
      await act(async () => vi.advanceTimersByTimeAsync(1));

      expect(api.get).toHaveBeenCalledTimes(14);
      expect(screen.getByText('dashboard.statusLine:dashboard.status.ready')).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTimeAsync(30000));
      expect(api.get).toHaveBeenCalledTimes(14);
    }
  );

  it('keeps a replacement master observation window when an old retry settles', async () => {
    vi.useFakeTimers();
    const retry = deferred<unknown>();
    api.list.mockResolvedValue([row('old', true)]);
    api.get.mockResolvedValue(status('processing'));
    api.retry.mockReturnValue(retry.promise);
    render(<Dashboard />);
    await act(async () => {});
    await exhaustProcessingPolls();
    fireEvent.click(screen.getAllByRole('button', { name: 'dashboard.retryProcessing' })[0]);

    api.list.mockResolvedValue([row('new', true)]);
    fireEvent.focus(window);
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(api.get.mock.calls.filter(([id]) => id === 'new')).toHaveLength(2);
    await act(async () => retry.resolve({ processing_status: 'processing' }));
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(api.get.mock.calls.filter(([id]) => id === 'new')).toHaveLength(3);
    await act(async () => vi.advanceTimersByTimeAsync(6000));

    // The current window is on a 12-second delay, unaffected by the old retry.
    expect(api.get.mock.calls.filter(([id]) => id === 'new')).toHaveLength(3);
    expect(api.get.mock.calls.filter(([id]) => id === 'old')).toHaveLength(13);
    expect(localStorage.getItem('master_resume_id')).toBe('new');
  });

  it('does not resume polling when a retry settles after unmount', async () => {
    vi.useFakeTimers();
    const retry = deferred<unknown>();
    api.list.mockResolvedValue([row('master', true)]);
    api.get.mockResolvedValue(status('processing'));
    api.retry.mockReturnValue(retry.promise);
    const view = render(<Dashboard />);
    await act(async () => {});
    await exhaustProcessingPolls();
    fireEvent.click(screen.getAllByRole('button', { name: 'dashboard.retryProcessing' })[0]);
    view.unmount();
    await act(async () => retry.resolve({ processing_status: 'processing' }));
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(api.get).toHaveBeenCalledTimes(13);
  });

  it('clears a master deleted while retry processing is pending', async () => {
    api.list.mockResolvedValue([row('master', true)]);
    api.get.mockResolvedValue(status('failed'));
    api.retry.mockRejectedValue(new Error('Failed to retry processing (status 404)'));
    render(<Dashboard />);
    await act(async () => {});
    await act(async () =>
      screen.getAllByRole('button', { name: 'dashboard.retryProcessing' })[0].click()
    );
    expect(localStorage.getItem('master_resume_id')).toBeNull();
    expect(screen.getByRole('button', { name: 'dashboard.initializeMasterResume' })).toBeVisible();
  });
});
