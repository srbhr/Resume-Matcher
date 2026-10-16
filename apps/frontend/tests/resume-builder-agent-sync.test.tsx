import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { AGENT_REFRESH_INTERVAL_MS } from '@/hooks/use-agent-refresh';

/**
 * Agent mode: the user's coding agent saves resumes from outside the app. The
 * builder picks those saves up on its own, never mistakes its own autosave for
 * one, and never lets autosave silently overwrite the agent's work.
 */

type Resume = Record<string, unknown> & { summary: string };

const server = vi.hoisted(() => ({
  resume: null as unknown as Resume,
  coverLetter: '',
  outreach: '',
  // When set, reads wait for it: a slow server.
  gate: null as Promise<void> | null,
}));
const form = vi.hoisted(() => ({ mounts: 0, nextEdit: 'Local edit' }));
const fetchResume = vi.fn();
const updateResume = vi.fn();
const updateCoverLetter = vi.fn();
const downloadResumePdf = vi.fn();
let currentSearch = 'id=res-1';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/lib/api/resume', () => ({
  fetchResume: (...args: unknown[]) => fetchResume(...args),
  updateResume: (...args: unknown[]) => updateResume(...args),
  updateCoverLetter: (...args: unknown[]) => updateCoverLetter(...args),
  downloadResumePdf: (...args: unknown[]) => downloadResumePdf(...args),
  downloadCoverLetterPdf: vi.fn(),
  getResumePdfUrl: vi.fn(() => ''),
  getCoverLetterPdfUrl: vi.fn(() => ''),
  updateOutreachMessage: vi.fn(),
  generateCoverLetter: vi.fn(),
  generateOutreachMessage: vi.fn(),
  generateInterviewPrep: vi.fn(),
  fetchJobDescription: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage: 'en', contentLanguage: 'en' }),
}));
vi.mock('@/components/common/resume_previewer_context', () => ({
  useResumePreview: () => ({ improvedData: null }),
}));
vi.mock('@/components/preview', () => ({ PaginatedPreview: () => null }));
// Shows the summary the editor holds, counts mounts and makes one local edit.
vi.mock('@/components/builder/resume-form', () => ({
  ResumeForm: function ResumeFormMock({
    resumeData,
    onUpdate,
  }: {
    resumeData: Resume;
    onUpdate: (data: Resume) => void;
  }) {
    React.useEffect(() => {
      form.mounts += 1;
    }, []);
    return (
      <div>
        <output data-testid="summary">{resumeData.summary}</output>
        <button onClick={() => onUpdate({ ...resumeData, summary: form.nextEdit })}>edit</button>
      </div>
    );
  },
}));
vi.mock('@/components/builder/formatting-controls', () => ({ FormattingControls: () => null }));
vi.mock('@/components/builder/cover-letter-preview', () => ({ CoverLetterPreview: () => null }));
vi.mock('@/components/builder/outreach-preview', () => ({ OutreachPreview: () => null }));
vi.mock('@/components/builder/generate-prompt', () => ({ GeneratePrompt: () => null }));
vi.mock('@/components/builder/interview-prep-view', () => ({ InterviewPrepView: () => null }));
vi.mock('@/components/builder/jd-comparison-view', () => ({ JDComparisonView: () => null }));
vi.mock('@/components/builder/regenerate-wizard', () => ({ RegenerateWizard: () => null }));
vi.mock('@/hooks/use-regenerate-wizard', () => ({
  useRegenerateWizard: () => ({ step: 'idle', reset: vi.fn() }),
}));

const RESUME: Resume = {
  personalInfo: { name: 'Ada Lovelace', email: 'ada@example.com' },
  summary: 'Saved summary',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
};

const importBuilder = async () =>
  (await import('@/components/builder/resume-builder')).ResumeBuilder;

async function renderBuilder(agentMode = true) {
  const ResumeBuilder = await importBuilder();
  render(<ResumeBuilder agentMode={agentMode} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** One agent check: the interval tick, plus the response. */
async function nextAgentCheck() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AGENT_REFRESH_INTERVAL_MS);
  });
}

/** The agent saves a new version through the resume-matcher command. */
function agentSaves(summary: string) {
  server.resume = { ...server.resume, summary };
}

beforeEach(() => {
  currentSearch = 'id=res-1';
  vi.useFakeTimers();
  localStorage.clear();
  server.resume = { ...RESUME };
  server.coverLetter = '';
  server.outreach = '';
  server.gate = null;
  form.mounts = 0;
  form.nextEdit = 'Local edit';
  fetchResume.mockReset();
  updateResume.mockReset();
  updateCoverLetter.mockReset();
  downloadResumePdf.mockReset();
  fetchResume.mockImplementation(async () => {
    if (server.gate) await server.gate;
    return {
      processed_resume: server.resume,
      cover_letter: server.coverLetter,
      outreach_message: server.outreach,
      parent_id: null,
      title: 'Resume',
      raw_resume: { processing_status: 'ready' },
    };
  });
  updateCoverLetter.mockImplementation(async (_id: string, content: string) => {
    server.coverLetter = content;
  });
  updateResume.mockImplementation(async (_id: string, data: Resume) => {
    server.resume = data;
    return { processed_resume: data };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetModules();
});

describe('builder in agent mode, when the agent saves', () => {
  it("shows the agent's version when the user has no unsaved edits", async () => {
    await renderBuilder();
    expect(screen.getByTestId('summary')).toHaveTextContent('Saved summary');

    agentSaves('Agent summary');
    await nextAgentCheck();

    expect(screen.getByTestId('summary')).toHaveTextContent('Agent summary');
    expect(screen.getByText('builder.agentUpdate.applied')).toBeInTheDocument();
    expect(updateResume).not.toHaveBeenCalled();
  });

  it('does not mistake its own autosave for the agent', async () => {
    await renderBuilder();
    fireEvent.click(screen.getByText('edit'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(updateResume).toHaveBeenCalledTimes(1);

    await nextAgentCheck();
    await nextAgentCheck();

    expect(screen.getByTestId('summary')).toHaveTextContent('Local edit');
    expect(screen.queryByText('builder.agentUpdate.applied')).toBeNull();
    expect(screen.queryByText('builder.agentUpdate.conflictTitle')).toBeNull();
  });

  it('does not mistake its own save for the agent while the save is in flight', async () => {
    // The server stores the edit at once, but the response arrives late.
    updateResume.mockImplementation((_id: string, data: Resume) => {
      server.resume = data;
      return new Promise((resolve) => setTimeout(() => resolve({ processed_resume: data }), 6_000));
    });
    await renderBuilder();
    fireEvent.click(screen.getByText('edit'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000); // autosave sends its PATCH
    });
    expect(updateResume).toHaveBeenCalledTimes(1);

    await nextAgentCheck(); // runs while the PATCH is still pending
    expect(screen.queryByText('builder.agentUpdate.conflictTitle')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.queryByText('builder.agentUpdate.conflictTitle')).toBeNull();
    expect(screen.queryByText('builder.agentUpdate.applied')).toBeNull();
  });

  it('pauses autosave and asks when the user is editing the same part', async () => {
    await renderBuilder();
    fireEvent.click(screen.getByText('edit'));
    agentSaves('Agent summary');
    // The page becoming visible checks at once, before autosave fires.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText('builder.agentUpdate.conflictTitle')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(updateResume).not.toHaveBeenCalled();
    expect(server.resume.summary).toBe('Agent summary');

    fireEvent.click(screen.getByText('builder.agentUpdate.useAgent'));
    expect(screen.getByTestId('summary')).toHaveTextContent('Agent summary');
    expect(screen.queryByText('builder.agentUpdate.conflictTitle')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(updateResume).not.toHaveBeenCalled();
  });

  it("saves the user's edits over the agent's when they keep them", async () => {
    await renderBuilder();
    fireEvent.click(screen.getByText('edit'));
    agentSaves('Agent summary');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.click(screen.getByText('builder.agentUpdate.keepMine'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(updateResume).toHaveBeenCalledTimes(1);
    expect(server.resume.summary).toBe('Local edit');

    await nextAgentCheck();
    expect(screen.queryByText('builder.agentUpdate.conflictTitle')).toBeNull();
    expect(screen.getByTestId('summary')).toHaveTextContent('Local edit');
  });

  it('shows a cover letter the agent saved', async () => {
    currentSearch = 'id=res-1&tab=cover-letter';
    await renderBuilder();
    expect(screen.getByRole('tab', { name: 'builder.previewTabs.coverLetter' })).toBeDisabled();

    server.coverLetter = 'Dear Acme, from the agent.';
    await nextAgentCheck();

    expect(screen.getByDisplayValue('Dear Acme, from the agent.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'builder.previewTabs.coverLetter' })).toBeEnabled();
    expect(updateCoverLetter).not.toHaveBeenCalled();
  });

  it('does not autosave over a version the agent saved after the editor last synced', async () => {
    await renderBuilder();
    // The agent saves, then the user edits before the next agent check runs.
    agentSaves('Agent summary');
    fireEvent.click(screen.getByText('edit'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000); // autosave fires before the 4s check
    });

    expect(updateResume).not.toHaveBeenCalled();
    expect(server.resume.summary).toBe('Agent summary');
    expect(screen.getByText('builder.agentUpdate.conflictTitle')).toBeInTheDocument();
  });

  it('does not save over the agent on Download while the user has not chosen', async () => {
    await renderBuilder();
    fireEvent.click(screen.getByText('edit'));
    agentSaves('Agent summary');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('builder.agentUpdate.conflictTitle')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /common\.download/ }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(updateResume).not.toHaveBeenCalled();
    expect(downloadResumePdf).not.toHaveBeenCalled();
    expect(server.resume.summary).toBe('Agent summary');
    expect(screen.getByText('builder.agentUpdate.chooseFirst')).toBeInTheDocument();
  });

  it('keeps edits typed while a save waits on the server', async () => {
    await renderBuilder();
    fireEvent.click(screen.getByText('edit')); // "Local edit"
    let release: () => void = () => {};
    server.gate = new Promise((resolve) => {
      release = resolve;
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /builder\.autoSave\.saveNow/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    // The user keeps typing while the pre-save check is still waiting.
    form.nextEdit = 'Second edit';
    fireEvent.click(screen.getByText('edit'));
    server.gate = null;
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(0);
    });
    // The first save went through, but the second edit is still unsaved...
    expect(server.resume.summary).toBe('Local edit');
    expect(screen.getByText('builder.autoSave.localDraft')).toBeInTheDocument();
    // ...so autosave saves it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(server.resume.summary).toBe('Second edit');
  });

  it("keeps unrelated unsaved edits when the user takes the agent's version", async () => {
    server.outreach = 'Saved outreach';
    currentSearch = 'id=res-1&tab=outreach';
    const ResumeBuilder = await importBuilder();
    const view = render(<ResumeBuilder agentMode />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.change(screen.getByDisplayValue('Saved outreach'), {
      target: { value: 'Local outreach' },
    });

    currentSearch = 'id=res-1&tab=resume';
    view.rerender(<ResumeBuilder agentMode />);
    fireEvent.click(screen.getByText('edit'));
    agentSaves('Agent summary');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByText('builder.agentUpdate.useAgent'));
    expect(screen.getByTestId('summary')).toHaveTextContent('Agent summary');

    currentSearch = 'id=res-1&tab=outreach';
    view.rerender(<ResumeBuilder agentMode />);
    expect(screen.getByDisplayValue('Local outreach')).toBeInTheDocument();
  });

  it("does not save a cover letter over the agent's", async () => {
    server.coverLetter = 'Saved letter';
    currentSearch = 'id=res-1&tab=cover-letter';
    await renderBuilder();
    fireEvent.change(screen.getByDisplayValue('Saved letter'), {
      target: { value: 'My letter' },
    });
    server.coverLetter = 'Agent letter';

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(updateCoverLetter).not.toHaveBeenCalled();
    expect(server.coverLetter).toBe('Agent letter');
    expect(screen.getByText('builder.agentUpdate.conflictTitle')).toBeInTheDocument();
  });

  it('does not rebuild the resume form when the agent changed only the cover letter', async () => {
    await renderBuilder();
    const mounts = form.mounts;
    server.coverLetter = 'Dear Acme';
    await nextAgentCheck();

    expect(screen.getByText('builder.agentUpdate.applied')).toBeInTheDocument();
    expect(form.mounts).toBe(mounts);
  });

  it('does not look for agent changes outside agent mode', async () => {
    await renderBuilder(false);
    agentSaves('Agent summary');
    await nextAgentCheck();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchResume).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('summary')).toHaveTextContent('Saved summary');
  });
});
