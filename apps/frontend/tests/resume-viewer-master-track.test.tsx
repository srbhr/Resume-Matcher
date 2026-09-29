import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResumeViewerPage from '@/app/(default)/resumes/[id]/page';
import { fetchResume, renameResume, setDefaultMasterResume } from '@/lib/api/resume';

const push = vi.fn();
const translate = (key: string) => key;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: 'r1' }),
}));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: translate }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({ decrementResumes: vi.fn(), setHasMasterResume: vi.fn() }),
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
  setDefaultMasterResume: vi.fn(),
  downloadResumePdf: vi.fn(),
  getResumePdfUrl: vi.fn(() => 'https://example.invalid/pdf'),
}));

const mockedFetch = vi.mocked(fetchResume);
const mockedRename = vi.mocked(renameResume);
const mockedSetDefault = vi.mocked(setDefaultMasterResume);

function mockResume(overrides: Record<string, unknown>): void {
  mockedFetch.mockResolvedValue({
    processed_resume: { personalInfo: { name: 'Ada' } },
    raw_resume: { processing_status: 'ready' },
    ...overrides,
  } as Awaited<ReturnType<typeof fetchResume>>);
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe('resume viewer master tracks', () => {
  it('shows rename for a master and set-default for a non-default master', async () => {
    mockResume({ title: 'SWE track', is_master: true, is_default_master: false });
    mockedSetDefault.mockResolvedValue({ resume_id: 'r1', is_default_master: true });
    mockedRename.mockResolvedValue(undefined);
    render(<ResumeViewerPage />);

    // The title is the track name and stays editable for a master.
    fireEvent.click(await screen.findByRole('button', { name: 'SWE track' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Data track' } });
    await act(async () => fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }));
    expect(mockedRename).toHaveBeenCalledWith('r1', 'Data track');

    expect(screen.queryByText('resumeViewer.defaultBadge')).not.toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'resumeViewer.setDefault' }))
    );

    expect(mockedSetDefault).toHaveBeenCalledWith('r1');
    expect(localStorage.getItem('master_resume_id')).toBe('r1');
    expect(await screen.findByText('resumeViewer.setDefaultSuccess')).toBeInTheDocument();
    expect(screen.getByText('resumeViewer.defaultBadge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'resumeViewer.setDefault' })).toBeNull();
  });

  it('hides set-default on the default master', async () => {
    mockResume({ title: 'Main track', is_master: true, is_default_master: true });
    render(<ResumeViewerPage />);

    expect(await screen.findByText('resumeViewer.defaultBadge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'resumeViewer.setDefault' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Main track' })).toBeInTheDocument();
  });

  it('keeps the button and the stored default when setting the default fails', async () => {
    localStorage.setItem('master_resume_id', 'old');
    mockResume({ title: 'SWE track', is_master: true, is_default_master: false });
    mockedSetDefault.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ResumeViewerPage />);

    const button = await screen.findByRole('button', { name: 'resumeViewer.setDefault' });
    await act(async () => fireEvent.click(button));

    expect(mockedSetDefault).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('master_resume_id')).toBe('old');
    expect(screen.queryByText('resumeViewer.defaultBadge')).not.toBeInTheDocument();
    expect(screen.queryByText('resumeViewer.setDefaultSuccess')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'resumeViewer.setDefault' })).toBeEnabled();
  });

  it('shows a localized error when setting the default fails, and retries from it', async () => {
    mockResume({ title: 'SWE track', is_master: true, is_default_master: false });
    mockedSetDefault
      .mockRejectedValueOnce(
        new Error('Failed to set default master resume (status 500): {"detail":"db locked"}')
      )
      .mockResolvedValueOnce({ resume_id: 'r1', is_default_master: true });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ResumeViewerPage />);

    const button = await screen.findByRole('button', { name: 'resumeViewer.setDefault' });
    await act(async () => fireEvent.click(button));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('resumeViewer.setDefaultError');
    // The raw server response never reaches the user.
    expect(dialog).not.toHaveTextContent(/status 500|db locked/);

    await act(async () =>
      fireEvent.click(within(dialog).getByRole('button', { name: 'common.retry' }))
    );
    expect(mockedSetDefault).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('resumeViewer.setDefaultSuccess')).toBeInTheDocument();
    expect(screen.queryByText('resumeViewer.setDefaultError')).not.toBeInTheDocument();
  });

  it('derives the master flag from the server, not from localStorage', async () => {
    localStorage.setItem('master_resume_id', 'r1');
    mockResume({ title: 'Tailored', is_master: false, is_default_master: false, parent_id: 'm1' });
    render(<ResumeViewerPage />);

    await screen.findByRole('button', { name: 'Tailored' });
    expect(screen.queryByRole('button', { name: 'resumeViewer.enhanceResume' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'resumeViewer.setDefault' })).toBeNull();
    expect(screen.queryByText('resumeViewer.defaultBadge')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dashboard.deleteResume' })).toBeInTheDocument();
  });

  it('offers enrichment on a master that is not the stored default', async () => {
    mockResume({ title: 'Side track', is_master: true, is_default_master: false });
    render(<ResumeViewerPage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'resumeViewer.enhanceResume' })).toBeVisible()
    );
    expect(localStorage.getItem('master_resume_id')).toBeNull();
  });
});
