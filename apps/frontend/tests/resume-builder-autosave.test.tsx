import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

/**
 * Regression tests for the autosave orchestration in resume-builder.tsx.
 *
 * These pin the four data-loss defects found in the 2026-07-28 review:
 *   B-01 autosave firing before the server copy has loaded (placeholder overwrite)
 *   B-02 a failed load falling through to a stale-draft restore that then autosaves
 *   H-01 the debounce collapsing to 0 and PATCHing once per keystroke
 *   H-02 clearing the legacy draft key belonging to a different resume
 *
 * Every one of them merges clean and passes lint/build, so only a behavioural
 * test like this can catch a regression.
 */

const fetchResume = vi.fn();
const updateResume = vi.fn();

let currentSearch = 'id=res-1';

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

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage: 'en', contentLanguage: 'en' }),
}));

vi.mock('@/components/common/resume_previewer_context', () => ({
  useResumePreview: () => ({ improvedData: null }),
}));

// Heavy children are irrelevant to autosave scheduling; stub them out so the
// test exercises the effect orchestration rather than the whole editor tree.
vi.mock('@/components/preview', () => ({ PaginatedPreview: () => null }));
vi.mock('@/components/builder/resume-form', () => ({
  ResumeForm: ({ onUpdate }: { onUpdate: (d: Record<string, unknown>) => void }) => (
    <button data-testid="edit" onClick={() => onUpdate({ summary: `edit-${Date.now()}` })}>
      edit
    </button>
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
  vi.useFakeTimers();
  localStorage.clear();
  fetchResume.mockReset();
  updateResume.mockReset();
  updateResume.mockResolvedValue({ processed_resume: REAL_RESUME });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe('resume builder autosave', () => {
  it('B-01: does not PATCH before the server copy has loaded', async () => {
    // Server is slow; the form shows i18n placeholders in the meantime.
    let resolveFetch: (v: unknown) => void = () => {};
    fetchResume.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const ResumeBuilder = await importBuilder();
    render(<ResumeBuilder />);

    // User types over the placeholders while the GET is still in flight.
    await act(async () => {
      screen.getByTestId('edit').click();
    });

    // Advance well past the debounce and the max wait.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(updateResume).not.toHaveBeenCalled();

    // Once loaded, autosave is allowed again.
    await act(async () => {
      resolveFetch({ processed_resume: REAL_RESUME, parent_id: null, title: 'r' });
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      screen.getByTestId('edit').click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(updateResume).toHaveBeenCalled();
  });

  it('B-01b: the manual Save path is gated on load too, not just autosave', async () => {
    // Gating only the autosave effect left the Save button able to issue the
    // same destructive full-document PATCH while the fetch was in flight.
    let resolveFetch: (v: unknown) => void = () => {};
    fetchResume.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const ResumeBuilder = await importBuilder();
    render(<ResumeBuilder />);

    await act(async () => {
      screen.getByTestId('edit').click();
    });

    // Drive the manual save path directly (the button is also disabled, but the
    // guard must hold regardless of how the call arrives).
    const saveButton = screen.getAllByRole('button').find((b) => /save/i.test(b.textContent ?? ''));
    if (saveButton) {
      await act(async () => {
        saveButton.click();
      });
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(updateResume).not.toHaveBeenCalled();
    expect(saveButton).toBeDisabled();

    await act(async () => {
      resolveFetch({ processed_resume: REAL_RESUME, parent_id: null, title: 'r' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(saveButton).not.toBeDisabled();
  });

  it('B-02: a failed load does not resurrect a stale draft and autosave it', async () => {
    // A draft from a previous session is sitting in localStorage.
    localStorage.setItem(
      'resume_builder_draft:res-1',
      JSON.stringify({
        resumeId: 'res-1',
        updatedAt: Date.now() - 86_400_000,
        data: { ...REAL_RESUME, summary: 'STALE DRAFT from Monday' },
      })
    );
    fetchResume.mockRejectedValue(new Error('backend restarting'));

    const ResumeBuilder = await importBuilder();
    render(<ResumeBuilder />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    // The stale draft must never be PATCHed over a server copy we could not read.
    expect(updateResume).not.toHaveBeenCalled();
    // And the failure is surfaced rather than silently swallowed.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  // NOTE: the P0 cross-resume race (a superseded load response landing under a
  // different resume id) is NOT covered here. Reproducing it needs an in-place
  // navigation with two overlapping in-flight fetches, and every version I
  // built either passed with the fix reverted or failed with it applied — i.e.
  // it tested the harness, not the behaviour. Rather than ship a green test
  // that proves nothing, the gap is recorded. The fix is the `cancelled` flag
  // in the load effect, mirroring the JD effect directly below it.

  it('H-01: the debounce does not collapse to zero while typing over a slow link', async () => {
    fetchResume.mockResolvedValue({ processed_resume: REAL_RESUME, parent_id: null, title: 'r' });

    // A save that takes 1s. This is what makes the bug reachable: an edit lands
    // while the PATCH is in flight, so the post-save version check fails and
    // the buggy code never resets its "unsynced since" marker — pinning the
    // computed delay at 0 for the rest of the session.
    updateResume.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ processed_resume: REAL_RESUME }), 1_000);
        })
    );

    const ResumeBuilder = await importBuilder();
    render(<ResumeBuilder />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Type steadily for ~24s — well past RESUME_AUTOSAVE_MAX_WAIT_MS (12s).
    for (let i = 0; i < 40; i += 1) {
      await act(async () => {
        screen.getByTestId('edit').click();
        await vi.advanceTimersByTimeAsync(600);
      });
    }

    // 24s of typing at a 2.5s debounce is ~10 saves at worst. Without the floor
    // and the per-attempt reset the delay pins to 0 and this climbs with every
    // keystroke instead.
    expect(updateResume.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('H-02: clearing this resume’s draft leaves an unrelated legacy draft intact', async () => {
    // A pre-upgrade draft for a *new, unsaved* resume.
    localStorage.setItem(
      'resume_builder_draft',
      JSON.stringify({ ...REAL_RESUME, summary: 'unsaved new resume from the old release' })
    );
    fetchResume.mockResolvedValue({ processed_resume: REAL_RESUME, parent_id: null, title: 'r' });

    const ResumeBuilder = await importBuilder();
    render(<ResumeBuilder />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(localStorage.getItem('resume_builder_draft')).not.toBeNull();
  });
});
