import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '@/app/(default)/dashboard/page';
import { ResumeWizardPage } from '@/components/resume-wizard/resume-wizard-page';
import { createInitialResumeWizardState } from '@/lib/api/resume-wizard';
import {
  readResumeWizardCompletion,
  writeResumeWizardCompletion,
  writeResumeWizardDraft,
} from '@/lib/utils/resume-wizard-storage';

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key, locale: 'en' }),
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
vi.mock('@/lib/api/resume', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/resume')>()),
  fetchResumeList: (...args: unknown[]) => api.list(...args),
  fetchResume: (...args: unknown[]) => api.get(...args),
}));
vi.mock('@/components/dashboard/resume-upload-dialog', () => ({ ResumeUploadDialog: () => null }));
vi.mock('@/components/dashboard/master-resume-choice-dialog', () => ({
  MasterResumeChoiceDialog: () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function writeNewDraft(): void {
  const state = createInitialResumeWizardState();
  state.step = 'question';
  state.current_question = { text: 'A newer question', section: 'skills' };
  writeResumeWizardDraft(state);
}

async function confirmMasterDelete(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'dashboard.deleteAndReupload' }));
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'dashboard.deleteAndReupload',
      })
    );
  });
}

describe('wizard completion receipt retirement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    api.list.mockResolvedValue([
      {
        resume_id: 'master',
        title: 'master',
        filename: 'master.pdf',
        is_master: true,
        processing_status: 'failed',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        parent_id: null,
      },
    ]);
    api.get.mockResolvedValue({
      processed_resume: null,
      raw_resume: { processing_status: 'failed' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    writeResumeWizardCompletion('master');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retains recovery when scheduled navigation never mounts the destination', async () => {
    const view = render(<ResumeWizardPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
    );
    expect(api.push).toHaveBeenCalledWith('/builder?id=master');
    view.unmount();
    render(<ResumeWizardPage />);
    expect(
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
    ).toBeVisible();
    expect(readResumeWizardCompletion()).toBe('master');
    expect(screen.queryByRole('button', { name: 'resumeWizard.actions.create' })).toBeNull();
  });

  it('retains the receipt and recovery screen when navigation fails', async () => {
    api.push.mockImplementation(() => {
      throw new Error('Navigation failed');
    });
    const view = render(<ResumeWizardPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'resumeWizard.errors.createdNavigationFailed'
    );
    view.unmount();
    render(<ResumeWizardPage />);
    expect(
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
    ).toBeVisible();
    expect(readResumeWizardCompletion()).toBe('master');
  });

  it('keeps the receipt across repeated scheduled openings without a loaded destination', async () => {
    const first = render(<ResumeWizardPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
    );
    first.unmount();
    const second = render(<ResumeWizardPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
    );
    expect(api.push).toHaveBeenCalledTimes(2);
    second.unmount();
    render(<ResumeWizardPage />);
    expect(
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
    ).toBeVisible();
    expect(readResumeWizardCompletion()).toBe('master');
  });

  it.each(['draft', 'receipt'] as const)(
    'keeps a newer %s when the old resume is opened',
    async (kind) => {
      const view = render(<ResumeWizardPage />);
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' });
      if (kind === 'draft') writeNewDraft();
      else writeResumeWizardCompletion('new-master');
      fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.openCreated' }));
      view.unmount();
      render(<ResumeWizardPage />);
      if (kind === 'draft') {
        expect(await screen.findByText('A newer question')).toBeVisible();
      } else {
        expect(readResumeWizardCompletion()).toBe('new-master');
        fireEvent.click(
          await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
        );
        expect(api.push).toHaveBeenLastCalledWith('/builder?id=new-master');
      }
    }
  );

  it('starts a fresh wizard after the master is successfully deleted from the dashboard', async () => {
    const view = render(<Dashboard />);
    await confirmMasterDelete();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/resumes/master',
      expect.objectContaining({ method: 'DELETE' })
    );
    view.unmount();
    render(<ResumeWizardPage />);
    expect(await screen.findByRole('textbox')).toBeVisible();
  });

  it('retains the receipt after a failed deletion', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('failed', { status: 500 }));
    const view = render(<Dashboard />);
    await confirmMasterDelete();
    expect(await screen.findByText('dashboard.errors.deleteFailed')).toBeVisible();
    view.unmount();
    render(<ResumeWizardPage />);
    expect(
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
    ).toBeVisible();
    expect(readResumeWizardCompletion()).toBe('master');
  });

  it.each(['draft', 'receipt'] as const)(
    'preserves a newer %s written while deletion is pending',
    async (kind) => {
      const response = deferred<Response>();
      vi.mocked(fetch).mockReturnValue(response.promise);
      const view = render(<Dashboard />);
      await confirmMasterDelete();
      if (kind === 'draft') writeNewDraft();
      else writeResumeWizardCompletion('new-master');
      await act(async () => response.resolve(new Response(null, { status: 204 })));
      view.unmount();
      render(<ResumeWizardPage />);
      if (kind === 'draft') {
        expect(await screen.findByText('A newer question')).toBeVisible();
      } else {
        expect(readResumeWizardCompletion()).toBe('new-master');
        expect(
          await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
        ).toBeVisible();
      }
    }
  );
});
