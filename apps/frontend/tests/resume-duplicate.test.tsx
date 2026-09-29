import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(default)/dashboard/page';
import ResumeViewerPage from '@/app/(default)/resumes/[id]/page';
import type { ResumeListItem } from '@/lib/api/resume';

const api = vi.hoisted(() => ({
  duplicate: vi.fn(),
  fetchResume: vi.fn(),
  list: vi.fn(),
  push: vi.fn(),
  incrementResumes: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: api.push }),
  useParams: () => ({ id: 'r1' }),
}));
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key, locale: 'en' }),
}));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: { llm_configured: true },
    isLoading: false,
    incrementResumes: api.incrementResumes,
    decrementResumes: vi.fn(),
    setHasMasterResume: vi.fn(),
  }),
}));
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage: 'en' }),
}));
vi.mock('@/components/enrichment/enrichment-modal', () => ({ EnrichmentModal: () => null }));
vi.mock('@/components/dashboard/resume-component', () => ({ default: () => null }));
vi.mock('@/components/dashboard/resume-upload-dialog', () => ({ ResumeUploadDialog: () => null }));
vi.mock('@/components/dashboard/master-resume-choice-dialog', () => ({
  MasterResumeChoiceDialog: () => null,
}));
vi.mock('@/lib/api/resume', () => ({
  MAX_MASTER_RESUMES: 5,
  duplicateResume: (...args: unknown[]) => api.duplicate(...args),
  fetchResume: (...args: unknown[]) => api.fetchResume(...args),
  fetchResumeList: (...args: unknown[]) => api.list(...args),
  fetchJobDescription: vi.fn().mockResolvedValue(null),
  setDefaultMasterResume: vi.fn(),
  deleteResume: vi.fn(),
  retryProcessing: vi.fn(),
  renameResume: vi.fn(),
  downloadResumePdf: vi.fn(),
  getResumePdfUrl: vi.fn(() => 'https://example.invalid/pdf'),
}));

const COPY = {
  resume_id: 'copy1',
  title: 'DevRel (Copy)',
  is_master: true,
  is_default_master: false,
  parent_id: null,
};

function mockViewerResume(overrides: Record<string, unknown> = {}): void {
  api.fetchResume.mockResolvedValue({
    processed_resume: { personalInfo: { name: 'Ada' } },
    raw_resume: { processing_status: 'ready' },
    title: 'DevRel',
    is_master: true,
    is_default_master: true,
    ...overrides,
  });
}

function row(id: string, overrides: Partial<ResumeListItem> = {}, master = true): ResumeListItem {
  return {
    resume_id: id,
    title: id,
    filename: `${id}.pdf`,
    is_master: master,
    is_default_master: false,
    processing_status: 'ready',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    parent_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('duplicateResume api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs to the duplicate endpoint and returns the copy', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api/resume')>('@/lib/api/resume');
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(COPY), { status: 201 }))
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(actual.duplicateResume('r1')).resolves.toEqual(COPY);

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/resumes\/r1\/duplicate$/);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
  });

  it('throws the server detail with the status on a 409', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api/resume')>('@/lib/api/resume');
    const detail = 'You can keep up to 5 master resumes. Delete one before adding another.';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ detail }), { status: 409 })))
    );

    await expect(actual.duplicateResume('r1')).rejects.toMatchObject({
      message: detail,
      status: 409,
    });
  });

  it('throws a status message when the failure has no detail', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api/resume')>('@/lib/api/resume');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('busy', { status: 503 })))
    );

    await expect(actual.duplicateResume('r1')).rejects.toMatchObject({
      message: 'Failed to duplicate resume (status 503): busy',
      status: 503,
    });
  });
});

describe('resume viewer duplicate', () => {
  it('duplicates the resume, bumps the counter and opens the copy', async () => {
    mockViewerResume();
    api.duplicate.mockResolvedValue(COPY);
    render(<ResumeViewerPage />);

    const button = await screen.findByRole('button', { name: 'resumeViewer.duplicate' });
    await act(async () => fireEvent.click(button));

    expect(api.duplicate).toHaveBeenCalledWith('r1');
    expect(api.incrementResumes).toHaveBeenCalledTimes(1);
    expect(api.push).toHaveBeenCalledWith('/resumes/copy1');
  });

  it('is offered on a tailored resume too', async () => {
    mockViewerResume({ is_master: false, is_default_master: false, parent_id: 'm1' });
    render(<ResumeViewerPage />);

    expect(await screen.findByRole('button', { name: 'resumeViewer.duplicate' })).toBeEnabled();
  });

  it('disables the button while the request runs', async () => {
    mockViewerResume();
    let resolveCopy: (value: typeof COPY) => void = () => undefined;
    api.duplicate.mockImplementation(
      () => new Promise<typeof COPY>((resolve) => (resolveCopy = resolve))
    );
    render(<ResumeViewerPage />);

    const button = await screen.findByRole('button', { name: 'resumeViewer.duplicate' });
    await act(async () => fireEvent.click(button));
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(api.duplicate).toHaveBeenCalledTimes(1);

    await act(async () => resolveCopy(COPY));
    expect(api.push).toHaveBeenCalledWith('/resumes/copy1');
  });

  it('shows the generic error and stays on the page when duplicating fails', async () => {
    mockViewerResume();
    api.duplicate.mockRejectedValue(new Error('Failed to duplicate resume (status 503): busy'));
    render(<ResumeViewerPage />);

    const button = await screen.findByRole('button', { name: 'resumeViewer.duplicate' });
    await act(async () => fireEvent.click(button));

    expect(await screen.findByText('resumeViewer.duplicateError')).toBeInTheDocument();
    expect(screen.queryByText(/status 503/)).not.toBeInTheDocument();
    expect(api.push).not.toHaveBeenCalled();
    expect(api.incrementResumes).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
  });

  it('shows the server detail when the master limit blocks the copy', async () => {
    const detail = 'You can keep up to 5 master resumes. Delete one before adding another.';
    mockViewerResume();
    api.duplicate.mockRejectedValue(Object.assign(new Error(detail), { status: 409 }));
    render(<ResumeViewerPage />);

    const button = await screen.findByRole('button', { name: 'resumeViewer.duplicate' });
    await act(async () => fireEvent.click(button));

    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(api.push).not.toHaveBeenCalled();
  });
});

describe('dashboard duplicate', () => {
  beforeEach(() => mockViewerResume({ resume_id: 'm1' }));

  const masters = (count: number): ResumeListItem[] =>
    Array.from({ length: count }, (_, i) =>
      row(`m${i + 1}`, { is_default_master: i === 0, title: `Track ${i + 1}` })
    );

  it('duplicates a non-default master and reloads the list without opening it', async () => {
    api.list.mockResolvedValue(masters(2));
    api.duplicate.mockResolvedValue(COPY);
    render(<DashboardPage />);

    const button = await screen.findByRole('button', { name: 'dashboard.duplicate' });
    const listCallsBefore = api.list.mock.calls.length;
    api.list.mockResolvedValue([...masters(2), row('copy1', { title: 'Track 2 (Copy)' })]);
    fireEvent.click(button);

    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith('m2'));
    await waitFor(() => expect(api.incrementResumes).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(listCallsBefore + 1));
    expect(await screen.findByText('Track 2 (Copy)')).toBeInTheDocument();
    // The button lives inside a clickable card; it must not also navigate.
    expect(api.push).not.toHaveBeenCalled();
  });

  it('is offered below the master limit and hidden at it', async () => {
    api.list.mockResolvedValue(masters(4));
    const below = render(<DashboardPage />);
    expect(await screen.findAllByRole('button', { name: 'dashboard.duplicate' })).toHaveLength(3);
    below.unmount();

    api.list.mockResolvedValue(masters(5));
    render(<DashboardPage />);
    expect(await screen.findAllByRole('button', { name: 'dashboard.setDefault' })).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'dashboard.duplicate' })).not.toBeInTheDocument();
  });

  it('cannot duplicate a master that is still processing', async () => {
    api.list.mockResolvedValue([
      row('m1', { is_default_master: true }),
      row('m2', { processing_status: 'processing' }),
    ]);
    render(<DashboardPage />);

    expect(await screen.findByRole('button', { name: 'dashboard.duplicate' })).toBeDisabled();
  });

  it('keeps the list as it was when duplicating fails', async () => {
    api.list.mockResolvedValue(masters(2));
    api.duplicate.mockRejectedValue(new Error('Failed to duplicate resume (status 503): busy'));
    render(<DashboardPage />);

    const button = await screen.findByRole('button', { name: 'dashboard.duplicate' });
    const listCallsBefore = api.list.mock.calls.length;
    fireEvent.click(button);

    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith('m2'));
    await waitFor(() => expect(button).toBeEnabled());
    expect(api.incrementResumes).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledTimes(listCallsBefore);
  });

  it('shows the generic error when duplicating fails', async () => {
    api.list.mockResolvedValue(masters(2));
    api.duplicate.mockRejectedValue(
      Object.assign(new Error('Failed to duplicate resume (status 503): busy'), { status: 503 })
    );
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'dashboard.duplicate' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('resumeViewer.duplicateError');
    expect(dialog).not.toHaveTextContent(/status 503|busy/);
  });

  it('shows the server detail when the master limit blocks the copy', async () => {
    const detail = 'You can keep up to 5 master resumes. Delete one before adding another.';
    api.list.mockResolvedValue(masters(2));
    api.duplicate.mockRejectedValue(Object.assign(new Error(detail), { status: 409 }));
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'dashboard.duplicate' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(detail);
    expect(dialog).not.toHaveTextContent('resumeViewer.duplicateError');
  });
});
