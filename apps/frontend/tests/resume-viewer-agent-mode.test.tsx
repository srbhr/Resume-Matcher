import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResumeViewerPage from '@/app/(default)/resumes/[id]/page';
import { fetchResume, renameResume } from '@/lib/api/resume';
import { analyzeResume } from '@/lib/api/enrichment';
import { AGENT_REFRESH_INTERVAL_MS } from '@/hooks/use-agent-refresh';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'resume-a' }),
}));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: { agent_mode: true },
    decrementResumes: vi.fn(),
    setHasMasterResume: vi.fn(),
  }),
}));
vi.mock('@/lib/context/language-context', () => ({ useLanguage: () => ({ uiLanguage: 'en' }) }));
vi.mock('@/components/dashboard/resume-component', () => ({ default: () => null }));
vi.mock('@/components/preview', () => ({
  PaginatedPreview: ({ resumeData }: { resumeData: { summary?: string } }) => (
    <div data-testid="summary">{resumeData.summary}</div>
  ),
}));
vi.mock('@/lib/api/resume', () => ({
  fetchResume: vi.fn(),
  deleteResume: vi.fn(),
  retryProcessing: vi.fn(),
  renameResume: vi.fn(),
  downloadResumePdf: vi.fn(),
  getResumePdfUrl: vi.fn(),
}));
vi.mock('@/lib/api/enrichment', () => ({
  analyzeResume: vi.fn(),
  generateEnhancements: vi.fn(),
  applyEnhancements: vi.fn(),
}));

const mockedFetchResume = vi.mocked(fetchResume);

function resume(summary: string, title = 'Master'): Awaited<ReturnType<typeof fetchResume>> {
  return {
    resume_id: 'resume-a',
    title,
    is_master: true,
    processed_resume: {
      personalInfo: { name: 'Ada' },
      summary,
      workExperience: [],
      education: [],
      personalProjects: [],
      additional: {},
    },
    raw_resume: {
      id: null,
      content: '',
      content_type: 'application/json',
      created_at: '2026-09-05T00:00:00Z',
      processing_status: 'ready',
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  mockedFetchResume.mockResolvedValue(resume('Before'));
});
afterEach(() => vi.useRealTimers());

describe('resume viewer in agent mode', () => {
  it('hands Enhance to the agent instead of calling the app AI', async () => {
    render(<ResumeViewerPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeViewer.enhanceResume' }));

    expect(screen.getByRole('dialog', { name: 'agentPrompt.enhance.title' })).toBeInTheDocument();
    expect(vi.mocked(analyzeResume)).not.toHaveBeenCalled();
  });

  it('shows what the agent saved without a reload', async () => {
    render(<ResumeViewerPage />);
    expect(await screen.findByTestId('summary')).toHaveTextContent('Before');

    mockedFetchResume.mockResolvedValue(resume('Enhanced by the agent'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_REFRESH_INTERVAL_MS);
    });

    expect(screen.getByTestId('summary')).toHaveTextContent('Enhanced by the agent');
  });

  it('does not let a check that started before a rename restore the old title', async () => {
    render(<ResumeViewerPage />);
    await screen.findByTestId('summary');

    // A check starts and the server is slow to answer.
    let answer: (value: Awaited<ReturnType<typeof fetchResume>>) => void = () => {};
    mockedFetchResume.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_REFRESH_INTERVAL_MS);
    });

    // Meanwhile the user renames the resume.
    vi.mocked(renameResume).mockResolvedValue(undefined as never);
    fireEvent.click(screen.getByRole('button', { name: 'resumeViewer.renameTitle' }));
    const input = screen.getByRole('textbox', { name: 'resumeViewer.renameTitle' });
    fireEvent.change(input, { target: { value: 'Renamed' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('heading', { name: 'Renamed' })).toBeInTheDocument();

    await act(async () => {
      answer(resume('Before', 'Master'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('heading', { name: 'Renamed' })).toBeInTheDocument();
  });
});
