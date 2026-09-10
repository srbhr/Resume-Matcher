import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  readResumeWizardCompletion,
  readResumeWizardDraft,
  writeResumeWizardCompletion,
  writeResumeWizardDraft,
} from '@/lib/utils/resume-wizard-storage';
import { createInitialResumeWizardState } from '@/lib/api/resume-wizard';

const fetchResume = vi.fn();
const updateResume = vi.fn();

let currentSearch = 'id=res-1';
let improvedData: { data: { resume_id: string; resume_preview: ResumeData } } | null = null;

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/api/resume', () => ({
  fetchResume: (...args: unknown[]) => fetchResume(...args),
  updateResume: (...args: unknown[]) => updateResume(...args),
  downloadResumePdf: vi.fn(),
  downloadCoverLetterPdf: vi.fn(),
  getResumePdfUrl: vi.fn(() => ''),
  getCoverLetterPdfUrl: vi.fn(() => ''),
  updateCoverLetter: vi.fn(),
  updateOutreachMessage: vi.fn(),
  generateCoverLetter: vi.fn(),
  generateOutreachMessage: vi.fn(),
  generateInterviewPrep: vi.fn(),
  fetchJobDescription: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/i18n', () => {
  const t = (key: string) => key;
  return { useTranslations: () => ({ t }) };
});

vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({ incrementResumes: vi.fn(), setHasMasterResume: vi.fn() }),
}));

vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage: 'en', contentLanguage: 'en' }),
}));

vi.mock('@/components/common/resume_previewer_context', () => ({
  useResumePreview: () => ({ improvedData }),
}));

// Heavy children are irrelevant to autosave scheduling; stub them out so the
// test exercises the effect orchestration rather than the whole editor tree.
vi.mock('@/components/preview', () => ({ PaginatedPreview: () => null }));
vi.mock('@/components/builder/resume-form', () => ({
  ResumeForm: ({
    resumeData,
    onUpdate,
  }: {
    resumeData: ResumeData;
    onUpdate: (data: ResumeData) => void;
  }) => (
    <div>
      <output data-testid="name">{resumeData.personalInfo?.name}</output>
      <output data-testid="summary">{resumeData.summary}</output>
      <button
        data-testid="edit"
        onClick={() => onUpdate({ ...resumeData, summary: `edit-${Date.now()}` })}
      >
        edit
      </button>
    </div>
  ),
}));
vi.mock('@/components/builder/formatting-controls', () => ({ FormattingControls: () => null }));
vi.mock('@/components/builder/cover-letter-editor', () => ({ CoverLetterEditor: () => null }));
vi.mock('@/components/builder/outreach-editor', () => ({ OutreachEditor: () => null }));
vi.mock('@/components/builder/cover-letter-preview', () => ({ CoverLetterPreview: () => null }));
vi.mock('@/components/builder/outreach-preview', () => ({ OutreachPreview: () => null }));
vi.mock('@/components/builder/generate-prompt', () => ({ GeneratePrompt: () => null }));
vi.mock('@/components/builder/interview-prep-view', () => ({ InterviewPrepView: () => null }));
vi.mock('@/components/builder/jd-comparison-view', () => ({ JDComparisonView: () => null }));
vi.mock('@/components/builder/regenerate-wizard', () => ({ RegenerateWizard: () => null }));
vi.mock('@/hooks/use-regenerate-wizard', () => ({
  useRegenerateWizard: () => ({ step: 'idle', reset: vi.fn() }),
}));

const REAL_RESUME = {
  personalInfo: { name: 'Ada Lovelace', email: 'ada@example.com' },
  summary: 'Real summary from the server',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
};

const importBuilder = async () =>
  (await import('@/components/builder/resume-builder')).ResumeBuilder;

beforeEach(() => {
  currentSearch = 'id=res-1';
  improvedData = null;
  vi.useFakeTimers();
  localStorage.clear();
  fetchResume.mockReset();
  updateResume.mockReset();
  updateResume.mockResolvedValue({ processed_resume: REAL_RESUME });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const BOB = {
  ...REAL_RESUME,
  personalInfo: { name: 'Bob', email: 'bob@example.com' },
  summary: 'Bob server baseline',
};
const tick = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const edit = async () => {
  await act(async () => {
    screen.getByTestId('edit').click();
  });
};
const save = async () => {
  await act(async () => {
    screen.getByRole('button', { name: 'builder.autoSave.saveNow' }).click();
  });
};
const setDraft = (id: string, data: ResumeData) =>
  localStorage.setItem(
    `resume_builder_draft:${id}`,
    JSON.stringify({ resumeId: id, updatedAt: Date.now(), data })
  );

describe('builder document ownership', () => {
  it('discards a new-resume draft without changing the fresh baseline', async () => {
    currentSearch = '';
    localStorage.setItem(
      'resume_builder_draft:new',
      JSON.stringify({
        resumeId: null,
        data: { ...REAL_RESUME, summary: 'discarded draft' },
        updatedAt: Date.now(),
      })
    );
    const Builder = await importBuilder();
    render(<Builder />);
    await tick();
    const baseline = screen.getByTestId('summary').textContent;
    await act(async () => {
      screen.getByRole('button', { name: 'builder.discardChanges' }).click();
    });
    expect(localStorage.getItem('resume_builder_draft:new')).toBeNull();
    expect(screen.getByTestId('summary').textContent).toBe(baseline);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await tick(20_000);
    expect(updateResume).not.toHaveBeenCalled();
  });

  it('asks before restoring a new-resume local draft and keeps it local after consent', async () => {
    currentSearch = '';
    localStorage.setItem(
      'resume_builder_draft:new',
      JSON.stringify({
        resumeId: null,
        updatedAt: Date.now(),
        data: { ...REAL_RESUME, summary: 'unsaved new draft' },
      })
    );
    const Builder = await importBuilder();
    render(<Builder />);
    await tick(20_000);
    expect(
      screen.getByRole('button', { name: 'builder.draftRecovery.restoreDraft' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('summary')).not.toHaveTextContent('unsaved new draft');
    expect(updateResume).not.toHaveBeenCalled();
    await act(async () => {
      screen.getByRole('button', { name: 'builder.draftRecovery.restoreDraft' }).click();
    });
    expect(screen.getByTestId('summary')).toHaveTextContent('unsaved new draft');
    await tick(20_000);
    expect(updateResume).not.toHaveBeenCalled();
  });
  it.each([
    ['automatic', 'success'],
    ['manual', 'success'],
    ['automatic', 'failure'],
    ['manual', 'failure'],
  ])(
    'ignores a late %s save (%s) before resetting and saving another resume',
    async (mode, outcome) => {
      fetchResume.mockImplementation((id: string) =>
        Promise.resolve({ processed_resume: id === 'res-1' ? REAL_RESUME : BOB })
      );
      const pending = deferred<{ processed_resume: ResumeData }>();
      updateResume
        .mockReturnValueOnce(pending.promise)
        .mockImplementation((_id: string, data: ResumeData) =>
          Promise.resolve({ processed_resume: data })
        );
      const Builder = await importBuilder();
      const view = render(<Builder />);
      await tick();
      await edit();
      if (mode === 'automatic') await tick(2500);
      else await save();
      expect(updateResume).toHaveBeenCalledTimes(1);
      const firstPayload = updateResume.mock.calls[0][1];
      currentSearch = 'id=res-2';
      view.rerender(<Builder />);
      await tick();
      expect(screen.getByTestId('name')).toHaveTextContent('Bob');
      await act(async () => {
        if (outcome === 'failure') pending.reject(new Error('old resume save failed'));
        else pending.resolve({ processed_resume: firstPayload });
      });
      await edit();
      await act(async () => {
        screen.getByRole('button', { name: 'common.reset' }).click();
      });
      expect(screen.getByTestId('name')).toHaveTextContent('Bob');
      expect(screen.getByTestId('summary')).toHaveTextContent('Bob server baseline');
      await edit();
      await save();
      expect(updateResume).toHaveBeenLastCalledWith(
        'res-2',
        expect.objectContaining({ personalInfo: BOB.personalInfo })
      );
    }
  );

  it('ignores an old GET after another resume has loaded', async () => {
    const old = deferred<unknown>();
    fetchResume.mockReturnValueOnce(old.promise).mockResolvedValue({ processed_resume: BOB });
    const Builder = await importBuilder();
    const view = render(<Builder />);
    currentSearch = 'id=res-2';
    view.rerender(<Builder />);
    await tick();
    await act(async () => {
      old.resolve({ processed_resume: REAL_RESUME });
    });
    expect(screen.getByTestId('name')).toHaveTextContent('Bob');
    await edit();
    await save();
    expect(updateResume).toHaveBeenLastCalledWith(
      'res-2',
      expect.objectContaining({ personalInfo: BOB.personalInfo })
    );
  });

  it('keeps a same-document edit dirty when an earlier save completes', async () => {
    fetchResume.mockResolvedValue({ processed_resume: REAL_RESUME });
    const pending = deferred<{ processed_resume: ResumeData }>();
    updateResume.mockReturnValueOnce(pending.promise);
    const Builder = await importBuilder();
    render(<Builder />);
    await tick();
    await edit();
    await tick(2500);
    const oldPayload = updateResume.mock.calls[0][1];
    await tick(1);
    await edit();
    const currentSummary = screen.getByTestId('summary').textContent;
    await act(async () => {
      pending.resolve({ processed_resume: oldPayload });
    });
    expect(screen.getByTestId('summary').textContent).toBe(currentSummary);
    expect(screen.getByRole('button', { name: 'builder.autoSave.saveNow' })).toBeEnabled();
    expect(localStorage.getItem('resume_builder_draft:res-1')).toContain(currentSummary);
  });

  it('does not clear a newer draft after leaving and reopening the same ID', async () => {
    fetchResume.mockImplementation((id: string) =>
      Promise.resolve({ processed_resume: id === 'res-1' ? REAL_RESUME : BOB })
    );
    const pending = deferred<{ processed_resume: ResumeData }>();
    updateResume.mockReturnValueOnce(pending.promise);
    const Builder = await importBuilder();
    const view = render(<Builder />);
    await tick();
    await edit();
    await tick(2500);
    const payload = updateResume.mock.calls[0][1];
    currentSearch = 'id=res-2';
    view.rerender(<Builder />);
    await tick();
    // A later browser session's draft must not be removed by the abandoned save.
    const newer = { ...REAL_RESUME, summary: 'newer draft while away' };
    setDraft('res-1', newer);
    currentSearch = 'id=res-1';
    view.rerender(<Builder />);
    await tick();
    await act(async () => {
      screen.getByRole('button', { name: 'builder.draftRecovery.restoreDraft' }).click();
    });
    await act(async () => {
      pending.resolve({ processed_resume: payload });
    });
    expect(localStorage.getItem('resume_builder_draft:res-1')).toContain(newer.summary);
  });
});

describe.each([false, true])(
  'draft recovery requires a readable server baseline (unrelated context: %s)',
  (withContext) => {
    it.each([
      [
        'Markdown',
        {
          processed_resume: null,
          raw_resume: { content: '# raw Markdown', processing_status: 'failed' },
        },
      ],
      ['invalid JSON shape', { processed_resume: null, raw_resume: { content: '{}' } }],
      ['invalid processed shape', { processed_resume: {} }],
      [
        'processing',
        {
          processed_resume: REAL_RESUME,
          raw_resume: { content: '# raw', processing_status: 'processing' },
        },
      ],
    ])(
      'blocks writes for a %s response and retains a recoverable draft',
      async (_label, response) => {
        setDraft('res-1', { ...REAL_RESUME, summary: 'stale draft' });
        fetchResume.mockResolvedValue(response);
        if (withContext)
          improvedData = { data: { resume_id: 'another-resume', resume_preview: BOB } };
        const Builder = await importBuilder();
        render(<Builder />);
        await tick(20_000);
        expect(updateResume).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('builder.alerts.loadFailed');
        expect(localStorage.getItem('resume_builder_draft:res-1')).toContain('stale draft');
        expect(screen.queryByTestId('name')).not.toBeInTheDocument();
      }
    );

    it.each(['processed', 'raw JSON'])(
      'requires consent before saving a draft over usable %s',
      async (kind) => {
        setDraft('res-1', { ...REAL_RESUME, summary: 'approved recovered draft' });
        fetchResume.mockResolvedValue(
          kind === 'processed'
            ? { processed_resume: REAL_RESUME }
            : { processed_resume: null, raw_resume: { content: JSON.stringify(REAL_RESUME) } }
        );
        updateResume.mockImplementation((_id: string, data: ResumeData) =>
          Promise.resolve({ processed_resume: data })
        );
        const Builder = await importBuilder();
        render(<Builder />);
        await tick(20_000);
        expect(updateResume).not.toHaveBeenCalled();
        expect(screen.getByTestId('summary')).toHaveTextContent(REAL_RESUME.summary);
        await act(async () => {
          screen.getByRole('button', { name: 'builder.draftRecovery.restoreDraft' }).click();
        });
        await tick(2500);
        expect(updateResume).toHaveBeenCalledWith(
          'res-1',
          expect.objectContaining({ summary: 'approved recovered draft' })
        );
      }
    );
  }
);

it.each(['legacy pending', 'partial raw JSON'])('loads a usable %s baseline', async (kind) => {
  fetchResume.mockResolvedValue(
    kind === 'legacy pending'
      ? { processed_resume: REAL_RESUME, raw_resume: { processing_status: 'pending' } }
      : {
          processed_resume: null,
          raw_resume: { content: JSON.stringify({ summary: 'Partial editable resume' }) },
        }
  );
  const Builder = await importBuilder();
  render(<Builder />);
  await tick(0);
  expect(screen.getByTestId('summary')).toHaveTextContent(
    kind === 'legacy pending' ? REAL_RESUME.summary : 'Partial editable resume'
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

it('does not claim a restored backup if its source disappeared and the scoped write fails', async () => {
  setDraft('res-1', { ...REAL_RESUME, summary: 'RECOVERED' });
  fetchResume.mockResolvedValue({ processed_resume: REAL_RESUME });
  updateResume.mockRejectedValue(new Error('offline'));
  const Builder = await importBuilder();
  render(<Builder />);
  await tick(0);
  localStorage.removeItem('resume_builder_draft:res-1');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  await act(async () =>
    screen.getByRole('button', { name: 'builder.draftRecovery.restoreDraft' }).click()
  );
  expect(screen.queryByText('builder.autoSave.localDraft')).not.toBeInTheDocument();
  expect(screen.getByTestId('summary')).toHaveTextContent('RECOVERED');
});

describe('builder acknowledgement of wizard completion', () => {
  it.each(['processed', 'raw JSON'])(
    'retires the matching receipt only after a validated %s baseline loads, enabling a fresh wizard',
    async (kind) => {
      writeResumeWizardCompletion('res-1');
      const pending = deferred<unknown>();
      fetchResume.mockReturnValue(pending.promise);
      const Builder = await importBuilder();
      const view = render(<Builder />);
      await tick();
      expect(readResumeWizardCompletion()).toBe('res-1');
      expect(screen.getByTestId('name')).not.toHaveTextContent('Ada Lovelace');
      await act(async () => {
        pending.resolve(
          kind === 'processed'
            ? { processed_resume: REAL_RESUME }
            : { processed_resume: null, raw_resume: { content: JSON.stringify(REAL_RESUME) } }
        );
      });
      expect(screen.getByTestId('name')).toHaveTextContent('Ada Lovelace');
      expect(readResumeWizardCompletion()).toBeNull();
      view.unmount();
      const { ResumeWizardPage } = await import('@/components/resume-wizard/resume-wizard-page');
      render(<ResumeWizardPage />);
      await tick();
      expect(screen.getByRole('textbox')).toBeVisible();
      expect(screen.queryByText('resumeWizard.created.title')).toBeNull();
    }
  );

  it.each(['request failure', 'invalid processed shape', 'invalid raw JSON', 'processing'])(
    'retains the receipt and wizard recovery after a %s',
    async (kind) => {
      writeResumeWizardCompletion('res-1');
      if (kind === 'request failure') fetchResume.mockRejectedValue(new Error('offline'));
      else
        fetchResume.mockResolvedValue(
          kind === 'invalid processed shape'
            ? { processed_resume: {} }
            : kind === 'invalid raw JSON'
              ? { processed_resume: null, raw_resume: { content: '{}' } }
              : { processed_resume: REAL_RESUME, raw_resume: { processing_status: 'processing' } }
        );
      const Builder = await importBuilder();
      const view = render(<Builder />);
      await tick();
      expect(screen.getByRole('alert')).toHaveTextContent('builder.alerts.loadFailed');
      expect(readResumeWizardCompletion()).toBe('res-1');
      view.unmount();
      const { ResumeWizardPage } = await import('@/components/resume-wizard/resume-wizard-page');
      render(<ResumeWizardPage />);
      await tick();
      expect(
        screen.getByRole('button', { name: 'resumeWizard.actions.openCreated' })
      ).toBeVisible();
    }
  );

  it.each(['draft', 'receipt'] as const)(
    'preserves a newer %s written while the matching resume load is pending',
    async (kind) => {
      writeResumeWizardCompletion('res-1');
      const pending = deferred<unknown>();
      fetchResume.mockReturnValue(pending.promise);
      const Builder = await importBuilder();
      render(<Builder />);
      if (kind === 'draft') {
        const state = createInitialResumeWizardState();
        state.current_question.text = 'Newer wizard question';
        writeResumeWizardDraft(state);
      } else writeResumeWizardCompletion('res-2');
      await act(async () => pending.resolve({ processed_resume: REAL_RESUME }));
      expect(screen.getByTestId('name')).toHaveTextContent('Ada Lovelace');
      if (kind === 'draft')
        expect(readResumeWizardDraft()?.current_question.text).toBe('Newer wizard question');
      else expect(readResumeWizardCompletion()).toBe('res-2');
    }
  );

  it('preserves an unrelated receipt when another resume loads', async () => {
    writeResumeWizardCompletion('res-2');
    fetchResume.mockResolvedValue({ processed_resume: REAL_RESUME });
    const Builder = await importBuilder();
    render(<Builder />);
    await tick();
    expect(screen.getByTestId('name')).toHaveTextContent('Ada Lovelace');
    expect(readResumeWizardCompletion()).toBe('res-2');
  });

  it('preserves the receipt if the builder unmounts before its baseline arrives', async () => {
    writeResumeWizardCompletion('res-1');
    const pending = deferred<unknown>();
    fetchResume.mockReturnValue(pending.promise);
    const Builder = await importBuilder();
    const view = render(<Builder />);
    view.unmount();
    await act(async () => pending.resolve({ processed_resume: REAL_RESUME }));
    expect(readResumeWizardCompletion()).toBe('res-1');
  });

  it('can retire the receipt on a later loaded visit after storage recovers', async () => {
    writeResumeWizardCompletion('res-1');
    fetchResume.mockResolvedValue({ processed_resume: REAL_RESUME });
    const originalRemove = Storage.prototype.removeItem;
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    remove.mockImplementation(function (this: Storage, key: string) {
      if (key === 'resume_wizard_draft') throw new Error('Storage unavailable');
      originalRemove.call(this, key);
    });
    const Builder = await importBuilder();
    const first = render(<Builder />);
    await tick();
    expect(screen.getByTestId('name')).toHaveTextContent('Ada Lovelace');
    expect(readResumeWizardCompletion()).toBe('res-1');
    first.unmount();
    remove.mockRestore();
    render(<Builder />);
    await tick();
    expect(screen.getByTestId('name')).toHaveTextContent('Ada Lovelace');
    expect(readResumeWizardCompletion()).toBeNull();
  });
});
