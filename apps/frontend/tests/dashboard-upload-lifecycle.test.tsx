import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(default)/dashboard/page';
import { StatusCacheProvider, useStatusCache } from '@/lib/context/status-cache';
import { fetchSystemStatus } from '@/lib/api/config';
import { fetchResume, fetchResumeList } from '@/lib/api/resume';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key, locale: 'en' }),
}));
vi.mock('@/lib/api/config', () => ({ fetchSystemStatus: vi.fn() }));
vi.mock('@/lib/api/resume', () => ({
  fetchResume: vi.fn(),
  fetchResumeList: vi.fn(),
  deleteResume: vi.fn(),
  retryProcessing: vi.fn(),
  fetchJobDescription: vi.fn(),
}));

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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('counters')).toHaveTextContent('1:true');
  });
});
