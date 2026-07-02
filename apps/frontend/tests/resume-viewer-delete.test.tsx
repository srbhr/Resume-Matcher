import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ResumeViewerPage from '@/app/(default)/resumes/[id]/page';
import { fetchResume, deleteResume } from '@/lib/api/resume';

const push = vi.fn();
const decrementResumes = vi.fn();
const setHasMasterResume = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: 'resume-123' }),
}));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({ decrementResumes, setHasMasterResume }),
}));
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage: 'en' }),
}));
vi.mock('@/components/enrichment/enrichment-modal', () => ({ EnrichmentModal: () => null }));
vi.mock('@/components/dashboard/resume-component', () => ({ default: () => null }));
vi.mock('@/lib/api/resume', () => ({
  fetchResume: vi.fn(),
  deleteResume: vi.fn(),
  retryProcessing: vi.fn(),
  renameResume: vi.fn(),
  downloadResumePdf: vi.fn(),
  getResumePdfUrl: vi.fn(),
}));

const mockedFetchResume = vi.mocked(fetchResume);
const mockedDeleteResume = vi.mocked(deleteResume);

describe('ResumeViewerPage — delete from the processing-failed error state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('opens the confirm dialog and deletes the resume when processing has failed', async () => {
    // A resume whose processing failed: no processed_resume, status "failed".
    mockedFetchResume.mockResolvedValue({
      title: 'Broken Resume',
      raw_resume: { processing_status: 'failed' },
    } as Awaited<ReturnType<typeof fetchResume>>);
    mockedDeleteResume.mockResolvedValue(undefined);

    render(<ResumeViewerPage />);

    // The error card for a failed resume renders with the recovery actions.
    expect(await screen.findByText('resumeViewer.errors.processingFailed')).toBeInTheDocument();

    // Click "Delete & Start Over".
    fireEvent.click(screen.getByRole('button', { name: 'resumeViewer.deleteAndStartOver' }));

    // The confirmation dialog must actually mount in the error state (regression).
    const confirmButton = await screen.findByRole('button', {
      name: 'confirmations.deleteResumeConfirmLabel',
    });
    fireEvent.click(confirmButton);

    // The DELETE request is dispatched to the backend and the cache is updated.
    await waitFor(() => {
      expect(mockedDeleteResume).toHaveBeenCalledWith('resume-123');
      expect(decrementResumes).toHaveBeenCalledTimes(1);
    });

    // The success dialog appears and routes back to the dashboard. Scope to the
    // dialog because the error card also carries a "return to dashboard" button.
    await screen.findByText('resumeViewer.deletedTitle');
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'resumeViewer.returnToDashboard' }));
    expect(push).toHaveBeenCalledWith('/dashboard');
  });
});
