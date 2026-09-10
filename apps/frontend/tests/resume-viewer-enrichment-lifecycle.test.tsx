import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResumeViewerPage from '@/app/(default)/resumes/[id]/page';
import { fetchResume } from '@/lib/api/resume';
import { analyzeResume, applyEnhancements, generateEnhancements } from '@/lib/api/enrichment';

const route = vi.hoisted(() => ({ resumeId: 'resume-a' }));
const locale = vi.hoisted(() => ({ t: (key: string) => key }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: route.resumeId }),
}));
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: locale.t }),
}));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({ decrementResumes: vi.fn(), setHasMasterResume: vi.fn() }),
}));
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage: 'en' }),
}));
vi.mock('@/components/dashboard/resume-component', () => ({
  default: ({ resumeData }: { resumeData: { personalInfo?: { name?: string } } }) => (
    <div data-testid="resume-name">{resumeData.personalInfo?.name}</div>
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
const mockedAnalyzeResume = vi.mocked(analyzeResume);
const mockedGenerateEnhancements = vi.mocked(generateEnhancements);
const mockedApplyEnhancements = vi.mocked(applyEnhancements);

function resume(name: string, resumeId = 'resume-a'): Awaited<ReturnType<typeof fetchResume>> {
  return {
    resume_id: resumeId,
    title: `${name} resume`,
    processed_resume: {
      personalInfo: { name },
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function attemptClose(method: 'close button' | 'escape' | 'backdrop'): void {
  if (method === 'close button') {
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
  } else if (method === 'escape') {
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  } else {
    fireEvent.click(screen.getByRole('dialog'));
  }
}

async function reachSavedCompletion(expectedSaves = 1): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'resumeViewer.enhanceResume' }));
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Python systems' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.finish' }));
  fireEvent.click(await screen.findByRole('button', { name: 'enrichment.preview.applyButton' }));
  expect(
    await screen.findByRole('button', { name: 'enrichment.complete.doneButton' })
  ).toBeVisible();
  expect(mockedApplyEnhancements).toHaveBeenCalledTimes(expectedSaves);
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  route.resumeId = 'resume-a';
  localStorage.setItem('master_resume_id', 'resume-a');
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
  mockedAnalyzeResume.mockResolvedValue({
    items_to_enrich: [
      {
        item_id: 'exp_0',
        item_type: 'experience',
        title: 'Engineer',
        current_description: ['Built tools'],
        weakness_reason: 'Needs detail',
      },
    ],
    questions: [
      {
        question_id: 'q1',
        item_id: 'exp_0',
        question: 'What did you build?',
        placeholder: 'Describe the result',
      },
    ],
  });
  mockedGenerateEnhancements.mockResolvedValue({
    enhancements: [
      {
        item_id: 'exp_0',
        item_type: 'experience',
        title: 'Engineer',
        original_description: ['Built tools'],
        enhanced_description: ['Built reliable Python systems'],
      },
    ],
  });
  mockedApplyEnhancements.mockResolvedValue({ message: 'Saved', updated_items: 1 });
});

describe('resume viewer enrichment completion', () => {
  it('shows a refresh-only retry after apply succeeds and refresh fails', async () => {
    mockedFetchResume
      .mockResolvedValueOnce(resume('Before'))
      .mockRejectedValueOnce(new Error('Refresh offline'))
      .mockResolvedValueOnce(resume('After'));
    render(<ResumeViewerPage />);
    await reachSavedCompletion();

    fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('enrichment.complete.refreshFailed');
    fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.retryRefresh' }));
    await waitFor(() => expect(screen.getByTestId('resume-name')).toHaveTextContent('After'));
    expect(mockedApplyEnhancements).toHaveBeenCalledTimes(1);
    expect(mockedFetchResume).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not let an old enrichment refresh replace a new viewer identity', async () => {
    const staleRefresh = deferred<Awaited<ReturnType<typeof fetchResume>>>();
    mockedFetchResume
      .mockResolvedValueOnce(resume('A before'))
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce(resume('B current', 'resume-b'));
    const view = render(<ResumeViewerPage />);
    await reachSavedCompletion();
    fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));
    await waitFor(() => expect(mockedFetchResume).toHaveBeenCalledTimes(2));

    route.resumeId = 'resume-b';
    localStorage.setItem('master_resume_id', 'resume-b');
    view.rerender(<ResumeViewerPage />);
    await waitFor(() => expect(screen.getByTestId('resume-name')).toHaveTextContent('B current'));
    await act(async () => staleRefresh.resolve(resume('A stale')));

    expect(screen.getByTestId('resume-name')).toHaveTextContent('B current');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedApplyEnhancements).toHaveBeenCalledTimes(1);
  });

  it('allows completing enrichment for a new resume while the old refresh is pending', async () => {
    const staleRefresh = deferred<Awaited<ReturnType<typeof fetchResume>>>();
    mockedFetchResume
      .mockResolvedValueOnce(resume('A before'))
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce(resume('B before', 'resume-b'))
      .mockResolvedValueOnce(resume('B after', 'resume-b'));
    const view = render(<ResumeViewerPage />);
    await reachSavedCompletion();
    fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));

    route.resumeId = 'resume-b';
    localStorage.setItem('master_resume_id', 'resume-b');
    view.rerender(<ResumeViewerPage />);
    await waitFor(() => expect(screen.getByTestId('resume-name')).toHaveTextContent('B before'));
    await reachSavedCompletion(2);
    fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));
    await waitFor(() => expect(screen.getByTestId('resume-name')).toHaveTextContent('B after'));

    await act(async () => staleRefresh.resolve(resume('A stale')));
    expect(screen.getByTestId('resume-name')).toHaveTextContent('B after');
    expect(mockedApplyEnhancements).toHaveBeenCalledTimes(2);
    expect(mockedFetchResume).toHaveBeenLastCalledWith('resume-b');
  });

  it('retains the save and allows retry when the refresh has no processed resume', async () => {
    mockedFetchResume
      .mockResolvedValueOnce(resume('Before'))
      .mockResolvedValueOnce({ ...resume('Missing'), processed_resume: null })
      .mockResolvedValueOnce(resume('After'));
    render(<ResumeViewerPage />);
    await reachSavedCompletion();
    fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('enrichment.complete.refreshFailed');
    expect(screen.getByTestId('resume-name')).toHaveTextContent('Before');
    fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.retryRefresh' }));
    await waitFor(() => expect(screen.getByTestId('resume-name')).toHaveTextContent('After'));
    expect(mockedApplyEnhancements).toHaveBeenCalledTimes(1);
  });

  it.each(['close button', 'escape', 'backdrop'] as const)(
    'keeps the acknowledged refresh result after a pending %s close attempt',
    async (method) => {
      const pending = deferred<Awaited<ReturnType<typeof fetchResume>>>();
      mockedFetchResume
        .mockResolvedValueOnce(resume('Before'))
        .mockReturnValueOnce(pending.promise);
      render(<ResumeViewerPage />);
      await reachSavedCompletion();
      fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));
      const refreshButton = screen.getByRole('button', { name: 'enrichment.complete.refreshing' });
      expect(refreshButton).toBeDisabled();
      fireEvent.click(refreshButton);
      attemptClose(method);
      await act(async () => pending.resolve(resume('After')));

      expect(screen.getByTestId('resume-name')).toHaveTextContent('After');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockedFetchResume).toHaveBeenCalledTimes(2);
      expect(mockedApplyEnhancements).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['close button', 'escape', 'backdrop'] as const)(
    'keeps refresh-only recovery after a pending %s close attempt and failed refresh',
    async (method) => {
      const pending = deferred<Awaited<ReturnType<typeof fetchResume>>>();
      mockedFetchResume
        .mockResolvedValueOnce(resume('Before'))
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(resume('After retry'));
      render(<ResumeViewerPage />);
      await reachSavedCompletion();
      fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));
      attemptClose(method);
      await act(async () => pending.reject(new Error('Refresh offline')));

      expect(screen.getByRole('alert')).toHaveTextContent('enrichment.complete.refreshFailed');
      expect(screen.getByTestId('resume-name')).toHaveTextContent('Before');
      fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.retryRefresh' }));
      await waitFor(() =>
        expect(screen.getByTestId('resume-name')).toHaveTextContent('After retry')
      );
      expect(mockedApplyEnhancements).toHaveBeenCalledTimes(1);
      expect(mockedFetchResume).toHaveBeenCalledTimes(3);
    }
  );

  it.each(['close button', 'escape', 'backdrop'] as const)(
    'allows the %s to close again after refresh fails',
    async (method) => {
      mockedFetchResume
        .mockResolvedValueOnce(resume('Before'))
        .mockRejectedValueOnce(new Error('Refresh offline'));
      render(<ResumeViewerPage />);
      await reachSavedCompletion();
      fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));
      await screen.findByRole('alert');
      attemptClose(method);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockedApplyEnhancements).toHaveBeenCalledTimes(1);
    }
  );

  it('disables the header close button and prevents native ESC cancellation during refresh', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fetchResume>>>();
    mockedFetchResume.mockResolvedValueOnce(resume('Before')).mockReturnValueOnce(pending.promise);
    render(<ResumeViewerPage />);
    await reachSavedCompletion();
    fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));
    expect(screen.getByRole('button', { name: 'common.close' })).toBeDisabled();
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('dialog'), cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(screen.getByRole('dialog')).toBeVisible();
    await act(async () => pending.resolve(resume('After')));
    expect(screen.getByTestId('resume-name')).toHaveTextContent('After');
  });

  it('discards an acknowledged refresh after navigation unmounts its viewer', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fetchResume>>>();
    mockedFetchResume
      .mockResolvedValueOnce(resume('A before'))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(resume('B current', 'resume-b'));
    const view = render(<ResumeViewerPage />);
    await reachSavedCompletion();
    fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));
    view.unmount();
    route.resumeId = 'resume-b';
    localStorage.setItem('master_resume_id', 'resume-b');
    render(<ResumeViewerPage />);
    await waitFor(() => expect(screen.getByTestId('resume-name')).toHaveTextContent('B current'));
    await act(async () => pending.resolve(resume('A stale')));
    expect(screen.getByTestId('resume-name')).toHaveTextContent('B current');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedApplyEnhancements).toHaveBeenCalledTimes(1);
  });
});

it('preserves an acknowledged enrichment refresh failure through a UI language change', async () => {
  mockedFetchResume
    .mockResolvedValueOnce(resume('Before'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(resume('After'));
  const view = render(<ResumeViewerPage />);
  await reachSavedCompletion();
  fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.doneButton' }));
  await screen.findByRole('alert');
  locale.t = (key: string) => key;
  view.rerender(<ResumeViewerPage />);
  expect(screen.getByRole('button', { name: 'enrichment.complete.retryRefresh' })).toBeVisible();
  expect(mockedFetchResume).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'enrichment.complete.retryRefresh' }));
  await waitFor(() => expect(screen.getByTestId('resume-name')).toHaveTextContent('After'));
  expect(mockedApplyEnhancements).toHaveBeenCalledTimes(1);
});
