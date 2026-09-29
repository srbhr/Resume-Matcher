import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DashboardPage from '@/app/(default)/dashboard/page';
import type { fetchResume, ResumeListItem } from '@/lib/api/resume';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  setDefault: vi.fn(),
  remove: vi.fn(),
  push: vi.fn(),
  setHasMaster: vi.fn(),
  llmConfigured: true,
}));
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
    status: { llm_configured: api.llmConfigured },
    isLoading: false,
    incrementResumes: vi.fn(),
    decrementResumes: vi.fn(),
    setHasMasterResume: api.setHasMaster,
  }),
}));
vi.mock('@/lib/api/resume', () => ({
  MAX_MASTER_RESUMES: 5,
  fetchResumeList: (...args: unknown[]) => api.list(...args),
  fetchResume: (...args: unknown[]) => api.get(...args),
  setDefaultMasterResume: (...args: unknown[]) => api.setDefault(...args),
  deleteResume: (...args: unknown[]) => api.remove(...args),
  retryProcessing: vi.fn(),
  fetchJobDescription: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/components/dashboard/resume-upload-dialog', () => ({
  ResumeUploadDialog: ({
    open,
    onUploadComplete,
    onOpenChange,
    becomesDefault,
  }: {
    open: boolean;
    onUploadComplete: (id: string) => void;
    onOpenChange: (open: boolean) => void;
    becomesDefault?: boolean;
  }) => (
    <>
      <button onClick={() => onUploadComplete('uploaded')}>finish upload</button>
      <button onClick={() => onOpenChange(false)}>close upload</button>
      <output data-testid="upload-open">{String(open)}</output>
      <output data-testid="upload-becomes-default">{String(Boolean(becomesDefault))}</output>
    </>
  ),
}));
vi.mock('@/components/dashboard/master-resume-choice-dialog', () => ({
  MasterResumeChoiceDialog: ({ open }: { open: boolean }) =>
    open ? <div>choice dialog open</div> : null,
}));

function row(id: string, master = false): ResumeListItem {
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
  };
}

type ResumeResponse = Awaited<ReturnType<typeof fetchResume>>;
function status(
  value: ResumeResponse['raw_resume']['processing_status'] = 'ready'
): ResumeResponse {
  return {
    resume_id: 'm1',
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

describe('dashboard with several master resumes', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    api.llmConfigured = true;
    api.get.mockResolvedValue(status());
  });
  afterEach(() => vi.useRealTimers());

  it('renders every master and switches the default', async () => {
    const masters = (defaultId: string) => [
      { ...row('m1', true), is_default_master: defaultId === 'm1', title: 'DevRel' },
      { ...row('m2', true), is_default_master: defaultId === 'm2', title: 'Solutions Eng' },
      { ...row('child'), parent_id: 'm1' },
    ];
    api.list.mockResolvedValue(masters('m1'));
    api.setDefault.mockImplementation(async (id: string) => {
      // The backend now reports the new default on the next list call.
      api.list.mockResolvedValue(masters(id));
      return { resume_id: id, is_default_master: true };
    });
    render(<DashboardPage />);
    expect(await screen.findByText('DevRel')).toBeInTheDocument();
    expect(screen.getByText('Solutions Eng')).toBeInTheDocument();
    expect(screen.getByText('dashboard.defaultBadge').parentElement).toHaveTextContent('DevRel');
    expect(localStorage.getItem('master_resume_id')).toBe('m1');

    const listCallsBefore = api.list.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'dashboard.setDefault' }));

    await waitFor(() => expect(api.setDefault).toHaveBeenCalledWith('m2'));
    await waitFor(() => expect(localStorage.getItem('master_resume_id')).toBe('m2'));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(listCallsBefore + 1));
    await waitFor(() =>
      expect(screen.getByText('dashboard.defaultBadge').parentElement).toHaveTextContent(
        'Solutions Eng'
      )
    );
    // The button lives inside a clickable card; it must not also navigate.
    expect(api.push).not.toHaveBeenCalled();
  });

  it('shows a localized error when switching the default fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => consoleError.mockRestore());
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true, title: 'DevRel' },
      { ...row('m2', true), title: 'Solutions Eng' },
    ]);
    api.setDefault.mockRejectedValue(
      new Error('Failed to set default master resume (status 500): {"detail":"db locked"}')
    );
    render(<DashboardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'dashboard.setDefault' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('resumeViewer.setDefaultError');
    // The raw server response never reaches the user.
    expect(dialog).not.toHaveTextContent(/status 500|db locked/);
    expect(screen.getByText('dashboard.defaultBadge').parentElement).toHaveTextContent('DevRel');

    fireEvent.click(within(dialog).getByRole('button', { name: 'common.ok' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the master when its card is clicked', async () => {
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true },
      { ...row('m2', true), title: 'Solutions Eng' },
    ]);
    render(<DashboardPage />);
    fireEvent.click(await screen.findByText('Solutions Eng'));
    expect(api.push).toHaveBeenCalledWith('/resumes/m2');
  });

  it('falls back to the first master when none is flagged default', async () => {
    api.list.mockResolvedValue([row('a', true), row('b', true)]);
    render(<DashboardPage />);
    expect(await screen.findAllByRole('button', { name: 'dashboard.setDefault' })).toHaveLength(1);
    expect(localStorage.getItem('master_resume_id')).toBe('a');
    expect(screen.getByText('dashboard.defaultBadge').parentElement).toHaveTextContent('a');
  });

  it('labels an untitled extra master with its filename, then the track label', async () => {
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true },
      { ...row('m2', true), title: null },
      { ...row('m3', true), title: null, filename: null },
    ]);
    render(<DashboardPage />);
    expect(await screen.findByText('m2.pdf')).toBeInTheDocument();
    expect(screen.getByText('dashboard.masterTrack')).toBeInTheDocument();
  });

  it('keeps tailored resumes out of the master tiles', async () => {
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true },
      { ...row('m2', true), title: 'Solutions Eng' },
      { ...row('child'), parent_id: 'm1' },
    ]);
    render(<DashboardPage />);
    expect(await screen.findByText('child')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'dashboard.setDefault' })).toHaveLength(1);
  });

  it('hides the add-track tile at the master limit', async () => {
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true },
      ...['m2', 'm3', 'm4', 'm5'].map((id) => row(id, true)),
    ]);
    render(<DashboardPage />);
    expect(await screen.findAllByRole('button', { name: 'dashboard.setDefault' })).toHaveLength(4);
    expect(screen.queryByText(/dashboard.addMasterTrack/)).not.toBeInTheDocument();
  });

  it('shows the add-track tile below the limit and opens the choice dialog', async () => {
    api.list.mockResolvedValue([{ ...row('m1', true), is_default_master: true }]);
    render(<DashboardPage />);
    const tile = await screen.findByText(/dashboard.addMasterTrack/);
    expect(screen.getByText('dashboard.masterLimitReached')).toBeInTheDocument();
    expect(screen.queryByText('choice dialog open')).not.toBeInTheDocument();
    fireEvent.click(tile);
    expect(screen.getByText('choice dialog open')).toBeInTheDocument();
  });

  it('hides the add-track tile when the LLM is not configured', async () => {
    api.llmConfigured = false;
    api.list.mockResolvedValue([{ ...row('m1', true), is_default_master: true }]);
    render(<DashboardPage />);
    expect(await screen.findByText('dashboard.llmNotConfiguredTitle')).toBeInTheDocument();
    expect(screen.queryByText(/dashboard.addMasterTrack/)).not.toBeInTheDocument();
  });

  it('keeps the current default when an extra master finishes uploading', async () => {
    api.list.mockResolvedValue([{ ...row('m1', true), is_default_master: true }]);
    render(<DashboardPage />);
    await screen.findByText(/dashboard.addMasterTrack/);
    const listCallsBefore = api.list.mock.calls.length;
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true },
      { ...row('uploaded', true), title: 'Uploaded Track' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'finish upload' }));
    expect(await screen.findByText('Uploaded Track')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(listCallsBefore + 1);
    expect(localStorage.getItem('master_resume_id')).toBe('m1');
  });

  describe('delete and re-upload of a failed default', () => {
    const defaultTile = () => screen.getByText('dashboard.defaultBadge').parentElement;

    // Masters "old" (failed default) and "other" (ready). Deleting "old" makes the
    // server promote "other", which the dashboard adopts while the dialog is open.
    async function deleteFailedDefault(): Promise<void> {
      api.get.mockImplementation(async (id: string) => status(id === 'old' ? 'failed' : 'ready'));
      api.list.mockResolvedValue([
        { ...row('old', true), is_default_master: true, processing_status: 'failed' as const },
        row('other', true),
      ]);
      render(<DashboardPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'dashboard.deleteAndReupload' }));
      api.list.mockResolvedValue([{ ...row('other', true), is_default_master: true }]);
      await act(async () =>
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'dashboard.deleteAndReupload',
          })
        )
      );
      expect(api.remove).toHaveBeenCalledWith('old');
      await waitFor(() => expect(defaultTile()).toHaveTextContent('other'));
      api.list.mockResolvedValue([
        { ...row('other', true), is_default_master: true },
        row('uploaded', true),
      ]);
    }

    it('makes the re-uploaded resume the default instead of the promoted track', async () => {
      api.setDefault.mockImplementation(async (id: string) => {
        api.list.mockResolvedValue([
          row('other', true),
          { ...row('uploaded', true), is_default_master: true },
        ]);
        return { resume_id: id, is_default_master: true };
      });
      await deleteFailedDefault();

      fireEvent.click(screen.getByRole('button', { name: 'finish upload' }));

      await waitFor(() => expect(api.setDefault).toHaveBeenCalledExactlyOnceWith('uploaded'));
      await waitFor(() => expect(defaultTile()).toHaveTextContent('uploaded'));
      expect(localStorage.getItem('master_resume_id')).toBe('uploaded');
    });

    it('still lists the re-upload when making it the default fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleError.mockRestore());
      api.setDefault.mockRejectedValue(new Error('offline'));
      await deleteFailedDefault();

      fireEvent.click(screen.getByRole('button', { name: 'finish upload' }));

      expect(await screen.findByText('uploaded')).toBeInTheDocument();
      expect(api.setDefault).toHaveBeenCalledExactlyOnceWith('uploaded');
      expect(defaultTile()).toHaveTextContent('other');
      expect(localStorage.getItem('master_resume_id')).toBe('other');
    });

    it('keeps the master flag set while another master remains', async () => {
      await deleteFailedDefault();
      // "other" survived the delete, so Settings must not report that no master exists.
      expect(api.setHasMaster).not.toHaveBeenCalledWith(false);
    });

    it('clears the master flag when the deleted default was the last master', async () => {
      api.get.mockResolvedValue(status('failed'));
      api.list.mockResolvedValue([
        { ...row('old', true), is_default_master: true, processing_status: 'failed' as const },
      ]);
      render(<DashboardPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'dashboard.deleteAndReupload' }));
      api.list.mockResolvedValue([]);
      await act(async () =>
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'dashboard.deleteAndReupload',
          })
        )
      );
      expect(api.remove).toHaveBeenCalledWith('old');
      expect(api.setHasMaster).toHaveBeenLastCalledWith(false);
    });

    it('keeps the other masters and the open re-upload dialog when the refresh fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleError.mockRestore());
      api.get.mockImplementation(async (id: string) => status(id === 'old' ? 'failed' : 'ready'));
      api.list.mockResolvedValue([
        { ...row('old', true), is_default_master: true, processing_status: 'failed' as const },
        { ...row('other', true), title: 'Other Track' },
      ]);
      render(<DashboardPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'dashboard.deleteAndReupload' }));
      api.list.mockRejectedValue(new Error('offline'));
      await act(async () =>
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'dashboard.deleteAndReupload',
          })
        )
      );

      expect(await screen.findByRole('alert')).toHaveTextContent('dashboard.errors.loadFailed');
      expect(screen.getByText('Other Track')).toBeInTheDocument();
      expect(screen.getByTestId('upload-open')).toHaveTextContent('true');
      expect(screen.getByTestId('upload-becomes-default')).toHaveTextContent('true');
    });

    it('tells the user when the re-upload could not be made the default', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleError.mockRestore());
      api.setDefault.mockRejectedValue(
        new Error('Failed to set default master resume (status 500): {"detail":"db locked"}')
      );
      await deleteFailedDefault();

      fireEvent.click(screen.getByRole('button', { name: 'finish upload' }));

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('resumeViewer.setDefaultError');
      expect(dialog).not.toHaveTextContent(/status 500|db locked/);
      expect(await screen.findByText('uploaded')).toBeInTheDocument();
    });

    it('treats a later upload as an ordinary track once the re-upload dialog is closed', async () => {
      await deleteFailedDefault();
      fireEvent.click(screen.getByRole('button', { name: 'close upload' }));

      fireEvent.click(screen.getByRole('button', { name: 'finish upload' }));

      expect(await screen.findByText('uploaded')).toBeInTheDocument();
      expect(api.setDefault).not.toHaveBeenCalled();
      expect(defaultTile()).toHaveTextContent('other');
      expect(localStorage.getItem('master_resume_id')).toBe('other');
    });

    it('tells the upload dialog the re-upload becomes the default, and only then', async () => {
      api.setDefault.mockResolvedValue({ resume_id: 'uploaded', is_default_master: true });
      await deleteFailedDefault();
      expect(screen.getByTestId('upload-becomes-default')).toHaveTextContent('true');

      fireEvent.click(screen.getByRole('button', { name: 'finish upload' }));

      await waitFor(() =>
        expect(screen.getByTestId('upload-becomes-default')).toHaveTextContent('false')
      );
    });

    it('does not tell an ordinary upload it becomes the default', async () => {
      api.list.mockResolvedValue([{ ...row('m1', true), is_default_master: true }]);
      render(<DashboardPage />);
      await screen.findByText(/dashboard.addMasterTrack/);
      expect(screen.getByTestId('upload-becomes-default')).toHaveTextContent('false');
    });

    it('makes only the first completed upload the default', async () => {
      api.setDefault.mockResolvedValue({ resume_id: 'uploaded', is_default_master: true });
      await deleteFailedDefault();
      fireEvent.click(screen.getByRole('button', { name: 'finish upload' }));
      await waitFor(() => expect(api.setDefault).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: 'finish upload' }));
      await act(async () => {});

      expect(api.setDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe('the Tailor entry point', () => {
    // The only route to /tailor is the icon button on the "create resume" tile.
    const tailorButton = () =>
      within(screen.getByText('dashboard.createResume').parentElement!).getByRole('button');

    it('opens the tailor page when the default master failed but another master is ready', async () => {
      api.get.mockResolvedValue(status('failed'));
      api.list.mockResolvedValue([
        { ...row('m1', true), is_default_master: true, processing_status: 'failed' as const },
        { ...row('m2', true), title: 'Solutions Eng' },
      ]);
      render(<DashboardPage />);
      expect(
        await screen.findByText('dashboard.statusLine:dashboard.status.failed')
      ).toBeInTheDocument();
      expect(tailorButton()).toBeEnabled();
      fireEvent.click(tailorButton());
      expect(api.push).toHaveBeenCalledWith('/tailor');
    });

    it('stays disabled when no master is ready', async () => {
      api.get.mockResolvedValue(status('failed'));
      api.list.mockResolvedValue([
        { ...row('m1', true), is_default_master: true, processing_status: 'failed' as const },
        { ...row('m2', true), title: 'Solutions Eng', processing_status: 'failed' as const },
      ]);
      render(<DashboardPage />);
      expect(
        await screen.findByText('dashboard.statusLine:dashboard.status.failed')
      ).toBeInTheDocument();
      expect(screen.getByText('Solutions Eng')).toBeInTheDocument();
      expect(tailorButton()).toBeDisabled();
    });

    it('stays disabled when the LLM is not configured, even with a ready master', async () => {
      api.llmConfigured = false;
      api.get.mockResolvedValue(status('failed'));
      api.list.mockResolvedValue([
        { ...row('m1', true), is_default_master: true, processing_status: 'failed' as const },
        { ...row('m2', true), title: 'Solutions Eng' },
      ]);
      render(<DashboardPage />);
      expect(
        await screen.findByText('dashboard.statusLine:dashboard.status.failed')
      ).toBeInTheDocument();
      expect(tailorButton()).toBeDisabled();
    });
  });

  describe('polling extra masters that are still processing', () => {
    const processing = [
      { ...row('m1', true), is_default_master: true },
      { ...row('m2', true), processing_status: 'processing' as const },
    ];

    it('backs off, refreshes the list until the extra master is ready, then stops', async () => {
      vi.useFakeTimers();
      // Still processing after the first poll, so a second, longer wait follows.
      api.list
        .mockResolvedValueOnce(processing)
        .mockResolvedValueOnce(processing)
        .mockResolvedValue([
          { ...row('m1', true), is_default_master: true },
          { ...row('m2', true), processing_status: 'ready' as const },
        ]);
      render(<DashboardPage />);
      await act(async () => {});
      expect(api.list).toHaveBeenCalledTimes(1);
      await act(async () => vi.advanceTimersByTimeAsync(2999));
      expect(api.list).toHaveBeenCalledTimes(1);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(api.list).toHaveBeenCalledTimes(2);
      // The delay doubles: nothing at the first interval, the refresh at 6 s.
      await act(async () => vi.advanceTimersByTimeAsync(5999));
      expect(api.list).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(api.list).toHaveBeenCalledTimes(3);
      await act(async () => vi.advanceTimersByTimeAsync(120_000));
      expect(api.list).toHaveBeenCalledTimes(3);
    });

    it('gives up after the same attempt cap as the default master', async () => {
      vi.useFakeTimers();
      api.list.mockResolvedValue(processing);
      render(<DashboardPage />);
      await act(async () => {});
      for (let i = 0; i < 20; i++) await act(async () => vi.advanceTimersByTimeAsync(30_000));
      // One mount load plus 12 polls.
      expect(api.list).toHaveBeenCalledTimes(13);
      await act(async () => vi.advanceTimersByTimeAsync(300_000));
      expect(api.list).toHaveBeenCalledTimes(13);
    });

    it('does not poll over a newer refresh that is still in flight', async () => {
      vi.useFakeTimers();
      api.list.mockResolvedValue(processing);
      render(<DashboardPage />);
      await act(async () => {});
      expect(api.list).toHaveBeenCalledTimes(1);
      await act(async () => vi.advanceTimersByTimeAsync(2_900));
      // A focus refresh starts just before the poll is due and has not answered yet.
      api.list.mockReturnValue(new Promise(() => {}));
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      expect(api.list).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTimeAsync(200));
      expect(api.list).toHaveBeenCalledTimes(2);
    });

    it('resumes polling when the newer refresh that superseded it fails', async () => {
      vi.useFakeTimers();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleError.mockRestore());
      api.list.mockResolvedValue(processing);
      render(<DashboardPage />);
      await act(async () => {});
      await act(async () => vi.advanceTimersByTimeAsync(2_900));
      let failFocusRefresh!: (error: Error) => void;
      api.list.mockReturnValueOnce(
        new Promise((_, reject) => {
          failFocusRefresh = reject;
        })
      );
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      // The poll comes due while the focus refresh is in flight and stands down.
      await act(async () => vi.advanceTimersByTimeAsync(200));
      expect(api.list).toHaveBeenCalledTimes(2);

      await act(async () => failFocusRefresh(new Error('offline')));
      expect(screen.getByRole('alert')).toHaveTextContent('dashboard.errors.loadFailed');

      // Polling picks up again on the normal backoff instead of waiting for a focus.
      await act(async () => vi.advanceTimersByTimeAsync(2_999));
      expect(api.list).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(api.list).toHaveBeenCalledTimes(3);
    });

    it('resumes polling when a failed delete-and-reupload superseded it', async () => {
      vi.useFakeTimers();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleError.mockRestore());
      api.get.mockResolvedValue(status('failed'));
      api.list.mockResolvedValue([
        { ...row('m1', true), is_default_master: true, processing_status: 'failed' as const },
        { ...row('m2', true), processing_status: 'processing' as const },
      ]);
      api.remove.mockRejectedValue(new Error('delete failed'));
      render(<DashboardPage />);
      await act(async () => {});
      expect(api.list).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'dashboard.deleteAndReupload' }));
      await act(async () =>
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'dashboard.deleteAndReupload',
          })
        )
      );
      expect(api.remove).toHaveBeenCalledWith('m1');
      expect(screen.getByText('dashboard.errors.deleteFailed')).toBeInTheDocument();

      // No reload follows a failed delete, so the poll it superseded must be rescheduled.
      await act(async () => vi.advanceTimersByTimeAsync(3_000));
      expect(api.list).toHaveBeenCalledTimes(2);
    });

    it('stops polling on unmount', async () => {
      vi.useFakeTimers();
      api.list.mockResolvedValue(processing);
      const view = render(<DashboardPage />);
      await act(async () => {});
      view.unmount();
      await act(async () => vi.advanceTimersByTimeAsync(300_000));
      expect(api.list).toHaveBeenCalledTimes(1);
    });
  });
});
