import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import DashboardPage from '@/app/(default)/dashboard/page';
import { StatusCacheProvider, useStatusCache } from '@/lib/context/status-cache';
import { fetchSystemStatus } from '@/lib/api/config';
import {
  fetchResume,
  fetchResumeList,
  setDefaultMasterResume,
  type ResumeListItem,
} from '@/lib/api/resume';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key, locale: 'en' }),
}));
vi.mock('@/lib/api/config', () => ({ fetchSystemStatus: vi.fn() }));
vi.mock('@/lib/api/resume', () => ({
  MAX_MASTER_RESUMES: 5,
  fetchResume: vi.fn(),
  fetchResumeList: vi.fn(),
  deleteResume: vi.fn(),
  retryProcessing: vi.fn(),
  fetchJobDescription: vi.fn(),
  setDefaultMasterResume: vi.fn(),
}));

/** The list row the server returns for the uploaded resume. */
const master: ResumeListItem = {
  resume_id: 'resume-1',
  title: 'Main track',
  filename: 'resume.pdf',
  is_master: true,
  is_default_master: true,
  processing_status: 'ready',
  created_at: '2026-09-05T00:00:00Z',
  updated_at: '2026-09-05T00:00:00Z',
  parent_id: null,
};

function Counters() {
  const { status } = useStatusCache();
  return (
    <output data-testid="counters">
      {status?.database_stats.total_resumes}:{String(status?.has_master_resume)}
    </output>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.mocked(fetchSystemStatus).mockResolvedValue({
    status: 'ready',
    llm_configured: true,
    llm_healthy: true,
    has_master_resume: false,
    database_stats: {
      total_resumes: 0,
      total_jobs: 0,
      total_improvements: 0,
      has_master_resume: false,
    },
  });
  vi.mocked(fetchResumeList).mockResolvedValue([]);
  vi.mocked(fetchResume).mockResolvedValue({
    resume_id: 'resume-1',
    raw_resume: {
      id: null,
      content: '',
      content_type: 'json',
      created_at: '2026-09-05T00:00:00Z',
      processing_status: 'ready',
    },
    processed_resume: {
      personalInfo: { name: 'Synthetic Person', email: 'synthetic@example.com' },
      summary: 'Synthetic resume',
      workExperience: [],
      education: [],
      personalProjects: [],
      additional: {},
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          resume_id: 'resume-1',
          processing_status: 'ready',
          is_master: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe.each(['normal', 'StrictMode'] as const)('dashboard upload propagation (%s)', (mode) => {
  it('increments the real status cache once and replaces the upload with the master card', async () => {
    const app = (
      <StatusCacheProvider>
        <Counters />
        <DashboardPage />
      </StatusCacheProvider>
    );
    render(mode === 'StrictMode' ? <React.StrictMode>{app}</React.StrictMode> : app);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('counters')).toHaveTextContent('0:false');
    fireEvent.click(screen.getByRole('button', { name: 'dashboard.initializeMasterResume' }));
    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.entry.upload.action' }));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    // Once accepted, the upload is a master in the server list the dashboard reloads.
    vi.mocked(fetchResumeList).mockResolvedValue([master]);
    fireEvent.change(input!, {
      target: {
        files: [new File(['synthetic resume'], 'resume.pdf', { type: 'application/pdf' })],
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('counters')).toHaveTextContent('1:true');
    expect(localStorage.getItem('master_resume_id')).toBe('resume-1');
    // The upload dialog now stays mounted, so it closes itself after its success delay.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('counters')).toHaveTextContent('1:true');
  });
});

// Settings reads `has_master_resume` from the shared status cache, and other pages
// (the viewer's delete) can leave it stale, so each list load re-derives it.
describe('dashboard master flag reconcile', () => {
  function mockCachedFlag(hasMaster: boolean): void {
    vi.mocked(fetchSystemStatus).mockResolvedValue({
      status: 'ready',
      llm_configured: true,
      llm_healthy: true,
      has_master_resume: hasMaster,
      database_stats: {
        total_resumes: 0,
        total_jobs: 0,
        total_improvements: 0,
        has_master_resume: hasMaster,
      },
    });
  }

  const flush = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

  function renderDashboard(): void {
    render(
      <StatusCacheProvider>
        <Counters />
        <DashboardPage />
      </StatusCacheProvider>
    );
  }

  /** The first list request answers only when `answer` is called, after /status loaded. */
  function deferFirstList(): (rows: ResumeListItem[]) => Promise<void> {
    let resolveList: (rows: ResumeListItem[]) => void = () => undefined;
    vi.mocked(fetchResumeList).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveList = resolve;
      })
    );
    return async (rows) => {
      await act(async () => resolveList(rows));
      await flush();
    };
  }

  it('sets the flag when the list has masters although the cache said none', async () => {
    mockCachedFlag(false);
    const answer = deferFirstList();
    renderDashboard();
    await flush();
    expect(screen.getByTestId('counters')).toHaveTextContent('0:false');

    await answer([master]);

    expect(screen.getByTestId('counters')).toHaveTextContent('0:true');
  });

  it('clears the flag when the list has no masters', async () => {
    mockCachedFlag(true);
    const answer = deferFirstList();
    renderDashboard();
    await flush();
    expect(screen.getByTestId('counters')).toHaveTextContent('0:true');

    await answer([]);

    expect(screen.getByTestId('counters')).toHaveTextContent('0:false');
  });

  it.each([
    ['true', false, [master]],
    ['false', true, []],
  ] as const)(
    'keeps the reconciled flag (%s) when a later refresh fails',
    async (expected, cached, rows) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      onTestFinished(() => consoleError.mockRestore());
      mockCachedFlag(cached);
      const answer = deferFirstList();
      renderDashboard();
      await flush();
      await answer([...rows]);
      expect(screen.getByTestId('counters')).toHaveTextContent(`0:${expected}`);

      vi.mocked(fetchResumeList).mockRejectedValue(new Error('offline'));
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      await flush();

      expect(screen.getByRole('alert')).toHaveTextContent('dashboard.errors.loadFailed');
      expect(screen.getByTestId('counters')).toHaveTextContent(`0:${expected}`);
    }
  );
});

// "Delete and re-upload" makes the re-upload the default explicitly. The upload dialog
// closes itself 1.5 s after reporting success, so a failure to set the default must not
// open its error on top of it (and then lose the page scroll lock when it closes).
describe('dashboard re-upload default failure', () => {
  const flush = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

  it('shows the error alone, never stacked on the upload dialog', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    onTestFinished(() => consoleError.mockRestore());
    const readyResume = await fetchResume('any');
    vi.mocked(fetchResume).mockImplementation(async (id: string) => ({
      ...readyResume,
      resume_id: id,
      raw_resume: {
        ...readyResume.raw_resume,
        processing_status: id === 'old' ? 'failed' : 'ready',
      },
    }));
    const other: ResumeListItem = { ...master, resume_id: 'other', title: 'Other track' };
    vi.mocked(fetchResumeList).mockResolvedValue([
      { ...master, resume_id: 'old', processing_status: 'failed' },
      { ...other, is_default_master: false },
    ]);
    vi.mocked(setDefaultMasterResume).mockRejectedValue(new Error('offline'));
    render(
      <StatusCacheProvider>
        <DashboardPage />
      </StatusCacheProvider>
    );
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'dashboard.deleteAndReupload' }));
    vi.mocked(fetchResumeList).mockResolvedValue([other]);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'dashboard.deleteAndReupload',
      })
    );
    await flush();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          resume_id: 'uploaded',
          processing_status: 'ready',
          is_master: true,
          is_default_master: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    fireEvent.change(input!, {
      target: {
        files: [new File(['synthetic resume'], 'resume.pdf', { type: 'application/pdf' })],
      },
    });
    await flush();

    expect(setDefaultMasterResume).toHaveBeenCalledExactlyOnceWith('uploaded');
    const [dialog] = screen.getAllByRole('dialog');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog).toHaveTextContent('resumeViewer.setDefaultError');
    expect(document.body.style.overflow).toBe('hidden');

    // The upload dialog's own close delay passes; the error stays and keeps the lock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toHaveTextContent('resumeViewer.setDefaultError');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'common.ok' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
});
