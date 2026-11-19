import { act, fireEvent, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_REFRESH_INTERVAL_MS } from '@/hooks/use-agent-refresh';
import { startMsw } from './support/msw';
import { installDomShims, removeDomShims } from './support/dom-shims';
import {
  API,
  SERVER_RESUME,
  advance,
  backgroundHandlers,
  en,
  nameField,
  renderBuilder,
  resumeBody,
  route,
  typeName,
} from './support/builder-page';

/**
 * Agent mode: the user's coding agent saves resumes from outside the app. The
 * builder picks those saves up on its own, never mistakes its own save for
 * one, and never lets a save silently overwrite the agent's work.
 *
 * Real page and providers; MSW plays a backend that holds one resume; only
 * `next/navigation` is mocked. Edits go through the name field.
 */

vi.mock('next/navigation', async () => (await import('./support/navigation')).navigation);

type Resume = typeof SERVER_RESUME;

/** What the backend holds, and how it behaves. */
const backend = {
  resume: SERVER_RESUME as Resume,
  coverLetter: '',
  outreach: '',
  /** When set, resume reads wait for it: a slow server. */
  gate: null as Promise<void> | null,
  /** When set, a PATCH stores at once but answers this many ms later. */
  patchDelayMs: 0,
  /** When not 200, a resume PATCH stores nothing and fails with this status. */
  patchStatus: 200,
  jobKeywords: null as string[] | null,
  parentId: null as string | null,
};
const calls = { getResume: 0, patchResume: 0, patchCoverLetter: 0, pdf: 0, jobDescription: 0 };

const server = startMsw();

function serveBackend({ agentMode = true } = {}) {
  server.use(
    ...backgroundHandlers({ agentMode }),
    http.get(`${API}/resumes`, async () => {
      calls.getResume += 1;
      if (backend.gate) await backend.gate;
      return HttpResponse.json(
        resumeBody(backend.resume, {
          cover_letter: backend.coverLetter,
          outreach_message: backend.outreach,
          parent_id: backend.parentId,
          title: 'Resume',
        })
      );
    }),
    http.patch(`${API}/resumes/:id`, async ({ request }) => {
      calls.patchResume += 1;
      if (backend.patchStatus !== 200) {
        return HttpResponse.json({ detail: 'offline' }, { status: backend.patchStatus });
      }
      backend.resume = (await request.json()) as Resume;
      if (backend.patchDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, backend.patchDelayMs));
      }
      return HttpResponse.json(resumeBody(backend.resume));
    }),
    http.patch(`${API}/resumes/:id/cover-letter`, async ({ request }) => {
      calls.patchCoverLetter += 1;
      backend.coverLetter = ((await request.json()) as { content: string }).content;
      return HttpResponse.json({ request_id: 'req', data: {} });
    }),
    http.get(`${API}/resumes/:id/pdf`, () => {
      calls.pdf += 1;
      return new HttpResponse(new Blob(['%PDF']), {
        headers: { 'Content-Type': 'application/pdf' },
      });
    }),
    http.get(`${API}/resumes/:id/job-description`, () => {
      calls.jobDescription += 1;
      return HttpResponse.json({
        job_id: 'job-1',
        content: 'Python role',
        keywords: backend.jobKeywords,
        company: 'Acme',
      });
    }),
    http.get(`${API}/resumes/:id/ats-score`, () => HttpResponse.json(null))
  );
}

/** The agent saves a new version through the resume-matcher command. */
function agentRenames(name: string) {
  backend.resume = { ...backend.resume, personalInfo: { ...backend.resume.personalInfo, name } };
}

/** Let requests already started reach MSW and their responses land. */
const settle = () => advance(10);

/** One agent check: the interval tick, plus the response. */
async function nextAgentCheck() {
  await advance(AGENT_REFRESH_INTERVAL_MS);
  await settle();
}

/** The page becoming visible checks at once. */
async function pageBecomesVisible() {
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await settle();
}

async function openBuilder(options?: { agentMode?: boolean }) {
  serveBackend(options);
  const view = renderBuilder();
  await settle();
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  installDomShims();
  localStorage.clear();
  route.search = 'id=res-1';
  Object.assign(backend, {
    resume: SERVER_RESUME,
    coverLetter: '',
    outreach: '',
    gate: null,
    patchDelayMs: 0,
    patchStatus: 200,
    jobKeywords: null,
    parentId: null,
  });
  for (const key of Object.keys(calls) as Array<keyof typeof calls>) calls[key] = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  removeDomShims();
});

describe('builder in agent mode, when the agent saves', () => {
  it("shows the agent's version when the user has no unsaved edits", async () => {
    await openBuilder();
    expect(nameField()).toHaveValue('Ada Lovelace');

    agentRenames('Agent Ada');
    await nextAgentCheck();

    expect(nameField()).toHaveValue('Agent Ada');
    expect(screen.getByText(en.builder.agentUpdate.applied)).toBeInTheDocument();
    expect(calls.patchResume).toBe(0);
  });

  it('does not mistake its own autosave for the agent', async () => {
    await openBuilder();
    typeName('Local edit');
    await advance(3_000);
    await settle();
    expect(calls.patchResume).toBe(1);

    await nextAgentCheck();
    await nextAgentCheck();

    expect(nameField()).toHaveValue('Local edit');
    expect(screen.queryByText(en.builder.agentUpdate.applied)).toBeNull();
    expect(screen.queryByText(en.builder.agentUpdate.conflictTitle)).toBeNull();
  });

  it('does not mistake its own save for the agent while the save is in flight', async () => {
    // The server stores the edit at once, but the response arrives late.
    backend.patchDelayMs = 6_000;
    await openBuilder();
    typeName('Local edit');
    await advance(3_000); // autosave sends its PATCH
    await settle();
    expect(calls.patchResume).toBe(1);

    await nextAgentCheck(); // runs while the PATCH is still pending
    expect(screen.queryByText(en.builder.agentUpdate.conflictTitle)).toBeNull();
    await advance(10_000);
    expect(screen.queryByText(en.builder.agentUpdate.conflictTitle)).toBeNull();
    expect(screen.queryByText(en.builder.agentUpdate.applied)).toBeNull();
  });

  it('pauses autosave and asks when the user is editing the same part', async () => {
    await openBuilder();
    typeName('Local edit');
    agentRenames('Agent Ada');
    await pageBecomesVisible(); // before autosave fires

    expect(screen.getByText(en.builder.agentUpdate.conflictTitle)).toBeInTheDocument();
    await advance(15_000);
    expect(calls.patchResume).toBe(0);
    expect(backend.resume.personalInfo.name).toBe('Agent Ada');

    fireEvent.click(screen.getByText(en.builder.agentUpdate.useAgent));
    expect(nameField()).toHaveValue('Agent Ada');
    expect(screen.queryByText(en.builder.agentUpdate.conflictTitle)).toBeNull();
    await advance(15_000);
    expect(calls.patchResume).toBe(0);
  });

  it("saves the user's edits over the agent's when they keep them", async () => {
    await openBuilder();
    typeName('Local edit');
    agentRenames('Agent Ada');
    await pageBecomesVisible();

    fireEvent.click(screen.getByText(en.builder.agentUpdate.keepMine));
    await advance(3_000);
    await settle();
    expect(calls.patchResume).toBe(1);
    expect(backend.resume.personalInfo.name).toBe('Local edit');

    await nextAgentCheck();
    expect(screen.queryByText(en.builder.agentUpdate.conflictTitle)).toBeNull();
    expect(nameField()).toHaveValue('Local edit');
  });

  it('shows a cover letter the agent saved', async () => {
    route.search = 'id=res-1&tab=cover-letter';
    await openBuilder();
    expect(screen.getByRole('tab', { name: en.builder.previewTabs.coverLetter })).toBeDisabled();

    backend.coverLetter = 'Dear Acme, from the agent.';
    await nextAgentCheck();

    expect(screen.getByDisplayValue('Dear Acme, from the agent.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: en.builder.previewTabs.coverLetter })).toBeEnabled();
    expect(calls.patchCoverLetter).toBe(0);
  });

  it('does not autosave over a version the agent saved after the editor last synced', async () => {
    await openBuilder();
    // The agent saves, then the user edits before the next agent check runs.
    agentRenames('Agent Ada');
    typeName('Local edit');
    await advance(3_000); // autosave fires before the 4s check
    await settle();

    expect(calls.patchResume).toBe(0);
    expect(backend.resume.personalInfo.name).toBe('Agent Ada');
    expect(screen.getByText(en.builder.agentUpdate.conflictTitle)).toBeInTheDocument();
  });

  it('does not save over the agent on Download while the user has not chosen', async () => {
    await openBuilder();
    typeName('Local edit');
    agentRenames('Agent Ada');
    await pageBecomesVisible();
    expect(screen.getByText(en.builder.agentUpdate.conflictTitle)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: en.common.download }));
    await settle();

    expect(calls.patchResume).toBe(0);
    expect(calls.pdf).toBe(0);
    expect(backend.resume.personalInfo.name).toBe('Agent Ada');
    expect(screen.getByText(en.builder.agentUpdate.chooseFirst)).toBeInTheDocument();
  });

  it('keeps edits typed while a save waits on the server', async () => {
    await openBuilder();
    typeName('Local edit');
    let release: () => void = () => {};
    backend.gate = new Promise((resolve) => {
      release = resolve;
    });
    fireEvent.click(screen.getByRole('button', { name: en.builder.autoSave.saveNow }));
    await settle();
    // The user keeps typing while the pre-save check is still waiting.
    typeName('Second edit');
    backend.gate = null;
    await act(async () => release());
    await settle();

    // The first save went through, but the second edit is still unsaved...
    expect(backend.resume.personalInfo.name).toBe('Local edit');
    expect(screen.getByText(en.builder.autoSave.localDraft)).toBeInTheDocument();
    // ...so autosave saves it.
    await advance(5_000);
    await settle();
    expect(backend.resume.personalInfo.name).toBe('Second edit');
  });

  it("keeps unrelated unsaved edits when the user takes the agent's version", async () => {
    backend.outreach = 'Saved outreach';
    route.search = 'id=res-1&tab=outreach';
    const view = await openBuilder();
    fireEvent.change(screen.getByDisplayValue('Saved outreach'), {
      target: { value: 'Local outreach' },
    });

    route.search = 'id=res-1&tab=resume';
    view.rerender();
    typeName('Local edit');
    agentRenames('Agent Ada');
    await pageBecomesVisible();
    fireEvent.click(screen.getByText(en.builder.agentUpdate.useAgent));
    expect(nameField()).toHaveValue('Agent Ada');

    route.search = 'id=res-1&tab=outreach';
    view.rerender();
    expect(screen.getByDisplayValue('Local outreach')).toBeInTheDocument();
  });

  it("does not save a cover letter over the agent's", async () => {
    backend.coverLetter = 'Saved letter';
    route.search = 'id=res-1&tab=cover-letter';
    await openBuilder();
    fireEvent.change(screen.getByDisplayValue('Saved letter'), {
      target: { value: 'My letter' },
    });
    backend.coverLetter = 'Agent letter';

    fireEvent.click(screen.getByRole('button', { name: en.common.save }));
    await settle();

    expect(calls.patchCoverLetter).toBe(0);
    expect(backend.coverLetter).toBe('Agent letter');
    expect(screen.getByText(en.builder.agentUpdate.conflictTitle)).toBeInTheDocument();
  });

  it('keeps the resume form mounted when the agent changed only the cover letter', async () => {
    await openBuilder();
    // A rebuilt form replaces its inputs, which drops focus and the caret.
    const field = nameField();
    backend.coverLetter = 'Dear Acme';
    await nextAgentCheck();

    expect(screen.getByText(en.builder.agentUpdate.applied)).toBeInTheDocument();
    expect(nameField()).toBe(field);
  });

  it('keeps and saves unsaved resume edits when the agent changed only the cover letter', async () => {
    await openBuilder();
    expect(screen.getByRole('tab', { name: en.builder.previewTabs.coverLetter })).toBeDisabled();
    typeName('Local edit');
    backend.coverLetter = 'Dear Acme';
    await pageBecomesVisible(); // before autosave fires

    // The agent's letter is in (its preview tab opens); the resume edit stays.
    expect(screen.getByRole('tab', { name: en.builder.previewTabs.coverLetter })).toBeEnabled();
    expect(nameField()).toHaveValue('Local edit');
    await advance(6_000);
    await settle();

    expect(backend.resume.personalInfo.name).toBe('Local edit');
    expect(backend.coverLetter).toBe('Dear Acme');
  });

  it("clears a failed save when the user takes the agent's version", async () => {
    await openBuilder();
    backend.patchStatus = 503;
    typeName('Local edit');
    await advance(3_000);
    await settle();
    expect(screen.getByText(en.builder.alerts.autoSaveFailed)).toBeInTheDocument();

    agentRenames('Agent Ada');
    await pageBecomesVisible();
    fireEvent.click(screen.getByText(en.builder.agentUpdate.useAgent));
    await settle();

    expect(nameField()).toHaveValue('Agent Ada');
    expect(screen.queryByText(en.builder.alerts.autoSaveFailed)).toBeNull();
    expect(
      screen.getByRole('button', { name: en.builder.autoSave.savedButton })
    ).toBeInTheDocument();
  });

  it('picks up keywords the agent adds to the job', async () => {
    backend.parentId = 'master-1';
    route.search = 'id=res-1&tab=jd-match';
    await openBuilder();
    await settle(); // the job is fetched once the resume has loaded
    expect(screen.getByText(en.builder.jdMatch.atsScore.noKeywords)).toBeInTheDocument();

    backend.jobKeywords = ['Python'];
    await nextAgentCheck();

    expect(screen.queryByText(en.builder.jdMatch.atsScore.noKeywords)).toBeNull();
    expect(
      screen.getByText(en.builder.jdMatch.stats.jobKeywords.replace('{count}', '1'))
    ).toBeInTheDocument();
    // With keywords in hand it stops asking.
    const asked = calls.jobDescription;
    await nextAgentCheck();
    expect(calls.jobDescription).toBe(asked);
  });

  it('does not look for agent changes outside agent mode', async () => {
    await openBuilder({ agentMode: false });
    agentRenames('Agent Ada');
    await nextAgentCheck();
    await pageBecomesVisible();

    expect(calls.getResume).toBe(1);
    expect(nameField()).toHaveValue('Ada Lovelace');
  });
});
