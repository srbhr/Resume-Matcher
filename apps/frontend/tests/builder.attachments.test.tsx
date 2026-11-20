import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMsw } from './support/msw';
import { installDomShims, removeDomShims } from './support/dom-shims';
import {
  API,
  SERVER_RESUME,
  backgroundHandlers,
  deferred,
  en,
  renderBuilder,
  resumeBody,
  route,
  router,
} from './support/builder-page';

/**
 * The builder's attachments (cover letter, outreach message, interview prep):
 * which document they belong to, the panels they render in, and the tab strip.
 * Real page and editors; MSW plays a backend with two tailored resumes, a and b;
 * only `next/navigation` is mocked.
 */

vi.mock('next/navigation', async () => (await import('./support/navigation')).navigation);

type Kind = 'cover-letter' | 'outreach' | 'interview-prep';

const generateLabel = (kind: Kind) =>
  en.builder.generatePrompt.generateButton.replace(
    '{title}',
    kind === 'interview-prep'
      ? en.interviewPrep.title
      : kind === 'outreach'
        ? en.outreach.title
        : en.coverLetter.title
  );

const GENERATE_PATH: Record<Kind, string> = {
  'cover-letter': 'generate-cover-letter',
  outreach: 'generate-outreach',
  'interview-prep': 'generate-interview-prep',
};

/** What each resume holds. Both are tailored, so their job context loads. */
let documents: Record<string, Record<string, unknown>> = {};

/** Attachment saves the backend received, in order. */
let saves: Array<{ part: 'cover-letter' | 'outreach-message'; content: string }> = [];
/** Each save waits for the next queued gate, and fails with its response if it has one. */
let saveGates: Array<Promise<Response | void>> = [];
let failSaves = false;
let pdfRequests: string[] = [];
let resumeGets = 0;

const server = startMsw();

let generations = 0;

function serveBackend({ agentMode = false } = {}) {
  server.use(
    ...backgroundHandlers({ agentMode }),
    http.get(`${API}/resumes`, ({ request }) => {
      resumeGets += 1;
      const id = new URL(request.url).searchParams.get('resume_id') ?? '';
      return HttpResponse.json(
        resumeBody(SERVER_RESUME, {
          resume_id: id,
          parent_id: 'master',
          title: 'Synthetic @ Example',
          ...documents[id],
        })
      );
    }),
    http.get(`${API}/resumes/:id/job-description`, () =>
      HttpResponse.json({
        job_id: 'job-1',
        content: 'Python role',
        keywords: ['Python'],
        company: 'Example',
      })
    ),
    http.get(`${API}/resumes/:id/ats-score`, () => HttpResponse.json(null)),
    ...(['cover-letter', 'outreach-message'] as const).map((part) =>
      http.patch(`${API}/resumes/:id/${part}`, async ({ request, params }) => {
        const { content } = (await request.json()) as { content: string };
        saves.push({ part, content });
        const gate = saveGates.shift();
        const failure = gate ? await gate : undefined;
        if (failure) return failure;
        if (failSaves) return HttpResponse.json({ detail: 'offline' }, { status: 503 });
        const field = part === 'cover-letter' ? 'cover_letter' : 'outreach_message';
        documents[String(params.id)] = { ...documents[String(params.id)], [field]: content };
        return HttpResponse.json({ request_id: 'req', data: {} });
      })
    ),
    http.get(`${API}/resumes/:id/cover-letter/pdf`, ({ request }) => {
      const url = new URL(request.url);
      pdfRequests.push(url.pathname.replace(/^\/api\/v1/, '') + url.search);
      return new HttpResponse(new Blob(['%PDF']), {
        headers: { 'Content-Type': 'application/pdf' },
      });
    })
  );
}

/**
 * Generation that waits for the test to supply its text, then stores it on the
 * resume as the real endpoint does.
 */
function generateLater(kind: 'cover-letter' | 'outreach') {
  const text = deferred<string>();
  server.use(
    http.post(`${API}/resumes/:id/${GENERATE_PATH[kind]}`, async ({ params }) => {
      generations += 1;
      const content = await text.promise;
      const field = kind === 'cover-letter' ? 'cover_letter' : 'outreach_message';
      documents[String(params.id)] = { ...documents[String(params.id)], [field]: content };
      return HttpResponse.json({ content });
    })
  );
  return text;
}

/** Hold the next attachment save until the test releases it. */
function holdNextSave() {
  const gate = deferred<Response | void>();
  saveGates.push(gate.promise);
  return gate;
}

const coverSaves = () => saves.filter((save) => save.part === 'cover-letter').map((s) => s.content);

/** Hold a generation request until the test settles it with a reply. */
function holdGeneration(kind: Kind) {
  const reply = deferred<Response>();
  let started = false;
  server.use(
    http.post(`${API}/resumes/:id/${GENERATE_PATH[kind]}`, async () => {
      started = true;
      return reply.promise;
    })
  );
  return { reply, started: () => started };
}

async function openTab(id: string, tab: Kind) {
  route.search = `id=${id}&tab=${tab}`;
  const view = renderBuilder();
  // The generate control appears once the resume (and, for prep, its job) loaded.
  await screen.findByRole('button', { name: generateLabel(tab) });
  return view;
}

async function switchTo(view: { rerender: () => void }, id: string, tab: Kind) {
  route.search = `id=${id}&tab=${tab}`;
  view.rerender();
  await screen.findByRole('button', { name: generateLabel(tab) });
}

beforeEach(() => {
  installDomShims();
  localStorage.clear();
  documents = { a: {}, b: {} };
  saves = [];
  saveGates = [];
  failSaves = false;
  pdfRequests = [];
  resumeGets = 0;
  generations = 0;
  router.push.mockClear();
  // Saving a PDF uses two browser APIs jsdom lacks: blob URLs and link clicks.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:pdf'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  serveBackend();
});

afterEach(() => {
  vi.restoreAllMocks();
  removeDomShims();
});

describe('builder attachment ownership', () => {
  it.each([
    ['cover-letter', 'cover_letter', 'ALICE COVER'],
    ['outreach', 'outreach_message', 'ALICE OUTREACH'],
  ] as const)('clears %s when the next document has no value', async (tab, field, oldValue) => {
    documents = { a: { [field]: oldValue }, b: { [field]: null } };
    route.search = `id=a&tab=${tab}`;
    const view = renderBuilder();
    expect(await screen.findByDisplayValue(oldValue)).toBeInTheDocument();

    await switchTo(view, 'b', tab);

    expect(screen.queryByDisplayValue(oldValue)).not.toBeInTheDocument();
  });

  it.each(['cover-letter', 'outreach', 'interview-prep'] as const)(
    'ignores a late %s generation result after changing documents',
    async (kind) => {
      const held = holdGeneration(kind);
      const view = await openTab('a', kind);
      fireEvent.click(screen.getByRole('button', { name: generateLabel(kind) }));
      await waitFor(() => expect(held.started()).toBe(true));

      await switchTo(view, 'b', kind);
      await act(async () => {
        held.reply.resolve(
          HttpResponse.json(
            kind === 'interview-prep'
              ? {
                  interview_prep: {
                    questions: [{ question: 'QUESTION FOR A', answer_outline: [], category: 'x' }],
                    skill_gaps: [],
                  },
                }
              : { content: 'GENERATED FOR A' }
          )
        );
      });

      expect(screen.queryByDisplayValue('GENERATED FOR A')).not.toBeInTheDocument();
      expect(screen.queryByText('QUESTION FOR A')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: generateLabel(kind) })).toBeInTheDocument();
    }
  );

  it('ignores a late generation error after changing documents', async () => {
    const held = holdGeneration('cover-letter');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = await openTab('a', 'cover-letter');
    fireEvent.click(screen.getByRole('button', { name: generateLabel('cover-letter') }));
    await waitFor(() => expect(held.started()).toBe(true));

    await switchTo(view, 'b', 'cover-letter');
    await act(async () => {
      held.reply.resolve(HttpResponse.json({ detail: 'late failure for A' }, { status: 500 }));
    });

    expect(
      screen.queryByText(new RegExp(en.builder.alerts.coverLetterGenerateFailed.split('{')[0]))
    ).toBeNull();
    expect(screen.getByRole('button', { name: generateLabel('cover-letter') })).toBeEnabled();
  });
});

describe('builder attachment actions, per part', () => {
  const PARTS = [
    {
      tab: 'cover-letter',
      field: 'cover_letter',
      regenerate: en.coverLetter.regenerate,
      saveFailed: en.builder.alerts.coverLetterSaveFailed,
      generateFailed: en.builder.alerts.coverLetterGenerateFailed,
    },
    {
      tab: 'outreach',
      field: 'outreach_message',
      regenerate: en.outreach.regenerate,
      saveFailed: en.builder.alerts.outreachSaveFailed,
      generateFailed: en.builder.alerts.outreachGenerateFailed,
    },
  ] as const;

  it.each(PARTS)('$tab: a failed save names its own part', async ({ tab, saveFailed }) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    documents.a = { cover_letter: 'SERVER', outreach_message: 'SERVER' };
    failSaves = true;
    route.search = `id=a&tab=${tab}`;
    renderBuilder();
    fireEvent.change(await screen.findByDisplayValue('SERVER'), { target: { value: 'EDIT' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));

    expect(await screen.findByText(saveFailed)).toBeInTheDocument();
  });

  it.each(PARTS)(
    '$tab: a failed generation names its own part',
    async ({ tab, generateFailed }) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const held = holdGeneration(tab);
      await openTab('a', tab);
      fireEvent.click(screen.getByRole('button', { name: generateLabel(tab) }));
      await waitFor(() => expect(held.started()).toBe(true));
      await act(async () => {
        held.reply.resolve(HttpResponse.json({ detail: 'model offline' }, { status: 500 }));
      });

      expect(
        await screen.findByText(generateFailed.replace('{error}', 'model offline'))
      ).toBeInTheDocument();
    }
  );

  it.each(PARTS)(
    '$tab: Generate shows progress while it runs and is ready again after',
    async ({ tab, regenerate }) => {
      const held = holdGeneration(tab);
      await openTab('a', tab);
      fireEvent.click(screen.getByRole('button', { name: generateLabel(tab) }));
      await waitFor(() => expect(held.started()).toBe(true));
      expect(await screen.findByRole('button', { name: en.common.generating })).toBeDisabled();

      await act(async () => {
        held.reply.resolve(HttpResponse.json({ content: 'GENERATED' }));
      });

      expect(await screen.findByDisplayValue('GENERATED')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: regenerate })).toBeEnabled();
    }
  );

  it.each(PARTS)(
    '$tab: asks before replacing its own text, even when the other part is empty',
    async ({ tab, field, regenerate }) => {
      documents.a = { [field]: 'SERVER' };
      route.search = `id=a&tab=${tab}`;
      renderBuilder();
      await screen.findByDisplayValue('SERVER');
      fireEvent.click(screen.getByRole('button', { name: regenerate }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('button', { name: regenerate })).toBeInTheDocument();
      expect(generations).toBe(0);
    }
  );
});

describe('builder panels', () => {
  it.each(['cover-letter', 'outreach', 'interview-prep'] as const)(
    'renders the %s generate control in the editor column and keeps the output panel empty',
    async (tab) => {
      await openTab('a', tab);

      const generate = screen.getAllByRole('button', { name: generateLabel(tab) });
      expect(generate).toHaveLength(1);
      const output = screen.getByRole('tabpanel');
      // The control lives in the editor column (before the tab strip), not the output panel.
      expect(output).not.toContainElement(generate[0]);
      expect(
        screen.getByRole('tablist').compareDocumentPosition(generate[0]) &
          Node.DOCUMENT_POSITION_PRECEDING
      ).toBeTruthy();
      expect(within(output).getByText(en.builder.panels.nothingYet)).toBeInTheDocument();
    }
  );
});

describe('builder preview tabs', () => {
  it('names the tab strip after the Preview heading and points only the selected tab at the panel', async () => {
    await openTab('a', 'cover-letter');

    const tablist = screen.getByRole('tablist', { name: en.builder.panels.preview });
    const heading = screen.getByRole('heading', { name: en.builder.panels.preview });
    expect(tablist).toHaveAttribute('aria-labelledby', heading.id);
    const panel = screen.getByRole('tabpanel');
    const tabs = within(tablist).getAllByRole('tab');
    const selected = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAttribute('aria-controls', panel.id);
    for (const tab of tabs.filter((tab) => tab !== selected[0])) {
      expect(tab).not.toHaveAttribute('aria-controls');
    }
  });
});

describe('builder footer', () => {
  it('has no footer bar: no footer landmark and no logo', async () => {
    await openTab('a', 'cover-letter');

    expect(screen.queryByRole('contentinfo')).toBeNull();
    expect(screen.queryByAltText('Resume Matcher')).not.toBeInTheDocument();
  });
});

describe('builder attachment persistence', () => {
  const download = () =>
    fireEvent.click(screen.getAllByRole('button', { name: en.common.download }).at(-1)!);

  it('ignores a late save completion after changing documents', async () => {
    documents = { a: { cover_letter: 'A COVER' }, b: { cover_letter: 'B COVER' } };
    const save = holdNextSave();
    route.search = 'id=a&tab=cover-letter';
    const view = renderBuilder();
    fireEvent.change(await screen.findByDisplayValue('A COVER'), {
      target: { value: 'A EDIT' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));
    await waitFor(() => expect(coverSaves()).toEqual(['A EDIT']));

    route.search = 'id=b&tab=cover-letter';
    view.rerender();
    expect(await screen.findByDisplayValue('B COVER')).toBeInTheDocument();
    await act(async () => save.resolve());

    expect(screen.getByDisplayValue('B COVER')).toBeInTheDocument();
    expect(screen.queryByText(en.builder.alerts.coverLetterSaveSuccess)).toBeNull();
  });

  it('saves edited cover content before requesting its PDF', async () => {
    documents.a = { cover_letter: 'SERVER COVER' };
    const save = holdNextSave();
    route.search = 'id=a&tab=cover-letter';
    renderBuilder();
    fireEvent.change(await screen.findByDisplayValue('SERVER COVER'), {
      target: { value: 'EDITED COVER' },
    });

    download();
    await waitFor(() => expect(coverSaves()).toEqual(['EDITED COVER']));
    expect(pdfRequests).toEqual([]);

    await act(async () => save.resolve());
    await waitFor(() => expect(pdfRequests).toHaveLength(1));
    expect(pdfRequests[0]).toMatch(/^\/resumes\/a\/cover-letter\/pdf/);
    expect(pdfRequests[0]).toContain('A4');
  });

  it('aborts cover export and retains its draft when the save fails', async () => {
    documents.a = { cover_letter: 'SERVER COVER' };
    failSaves = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    route.search = 'id=a&tab=cover-letter';
    renderBuilder();
    fireEvent.change(await screen.findByDisplayValue('SERVER COVER'), {
      target: { value: 'RECOVERABLE COVER' },
    });

    download();

    expect(await screen.findByText(en.builder.alerts.coverLetterSaveFailed)).toBeInTheDocument();
    expect(pdfRequests).toEqual([]);
    expect(localStorage.getItem('resume_builder_attachment_draft:a')).toContain(
      'RECOVERABLE COVER'
    );
  });

  it('keeps a newer same-document edit dirty when an older cover save completes', async () => {
    documents.a = { cover_letter: 'SERVER COVER' };
    const save = holdNextSave();
    route.search = 'id=a&tab=cover-letter';
    renderBuilder();
    const editor = await screen.findByDisplayValue('SERVER COVER');
    fireEvent.change(editor, { target: { value: 'FIRST EDIT' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));
    await waitFor(() => expect(coverSaves()).toEqual(['FIRST EDIT']));
    fireEvent.change(editor, { target: { value: 'NEWER EDIT' } });
    await act(async () => save.resolve());

    expect(localStorage.getItem('resume_builder_attachment_draft:a')).toContain('NEWER EDIT');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it('saves the latest cover revision before exporting when editing continues during save', async () => {
    documents.a = { cover_letter: 'SERVER COVER' };
    const firstSave = holdNextSave();
    const latestSave = holdNextSave();
    route.search = 'id=a&tab=cover-letter';
    renderBuilder();
    const editor = await screen.findByDisplayValue('SERVER COVER');
    fireEvent.change(editor, { target: { value: 'FIRST EDIT' } });

    download();
    await waitFor(() => expect(coverSaves()).toEqual(['FIRST EDIT']));
    fireEvent.change(editor, { target: { value: 'NEWER EDIT' } });
    await act(async () => firstSave.resolve());

    await waitFor(() => expect(coverSaves()).toEqual(['FIRST EDIT', 'NEWER EDIT']));
    expect(pdfRequests).toEqual([]);
    await act(async () => latestSave.resolve());
    await waitFor(() => expect(pdfRequests).toHaveLength(1));
  });

  it('serializes an existing cover save ahead of the export flush', async () => {
    documents.a = { cover_letter: 'SERVER COVER' };
    const firstSave = holdNextSave();
    const latestSave = holdNextSave();
    route.search = 'id=a&tab=cover-letter';
    renderBuilder();
    const editor = await screen.findByDisplayValue('SERVER COVER');
    fireEvent.change(editor, { target: { value: 'FIRST EDIT' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));
    await waitFor(() => expect(coverSaves()).toEqual(['FIRST EDIT']));
    fireEvent.change(editor, { target: { value: 'NEWER EDIT' } });
    download();

    expect(coverSaves()).toEqual(['FIRST EDIT']);
    await act(async () => firstSave.resolve());
    await waitFor(() => expect(coverSaves()).toEqual(['FIRST EDIT', 'NEWER EDIT']));
    expect(pdfRequests).toEqual([]);
    await act(async () => latestSave.resolve());
    await waitFor(() => expect(pdfRequests).toHaveLength(1));
  });

  it('flushes outreach before Back and offers local-draft leave when it fails', async () => {
    documents.a = { outreach_message: 'SERVER OUTREACH' };
    failSaves = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    route.search = 'id=a&tab=outreach';
    renderBuilder();
    fireEvent.change(await screen.findByDisplayValue('SERVER OUTREACH'), {
      target: { value: 'RECOVERABLE OUTREACH' },
    });

    fireEvent.click(screen.getByRole('button', { name: en.nav.backToDashboard }));

    expect(await screen.findByText(en.builder.leaveWithLocalDraft.description)).toBeInTheDocument();
    expect(saves).toContainEqual({ part: 'outreach-message', content: 'RECOVERABLE OUTREACH' });
    expect(router.push).not.toHaveBeenCalled();
    expect(localStorage.getItem('resume_builder_attachment_draft:a')).toContain(
      'RECOVERABLE OUTREACH'
    );
  });

  it('warns that attachment edits have no backup when browser storage and save both fail', async () => {
    documents.a = { outreach_message: 'SERVER OUTREACH' };
    failSaves = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    route.search = 'id=a&tab=outreach';
    renderBuilder();
    const input = await screen.findByDisplayValue('SERVER OUTREACH');
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith('resume_builder_attachment_draft')) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    });

    fireEvent.change(input, { target: { value: 'UNSAVED OUTREACH' } });
    fireEvent.click(screen.getByRole('button', { name: en.nav.backToDashboard }));

    expect(await screen.findByText(en.builder.leaveWithoutDraft.description)).toBeInTheDocument();
    expect(screen.getByDisplayValue('UNSAVED OUTREACH')).toBeInTheDocument();
    expect(screen.queryByText(en.builder.leaveWithLocalDraft.description)).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('requires consent before restoring a resume-scoped attachment draft', async () => {
    localStorage.setItem(
      'resume_builder_attachment_draft:a',
      JSON.stringify({
        resumeId: 'a',
        updatedAt: Date.now(),
        coverLetter: 'LOCAL COVER',
        outreachMessage: '',
      })
    );
    documents.a = { cover_letter: 'SERVER COVER' };
    route.search = 'id=a&tab=cover-letter';
    renderBuilder();

    expect(await screen.findByDisplayValue('SERVER COVER')).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: en.builder.draftRecovery.restoreDraft })
    );

    expect(await screen.findByDisplayValue('LOCAL COVER')).toBeInTheDocument();
    expect(localStorage.getItem('resume_builder_attachment_draft:a')).toContain('LOCAL COVER');
  });

  it('restores the outreach message from the same draft', async () => {
    localStorage.setItem(
      'resume_builder_attachment_draft:a',
      JSON.stringify({
        resumeId: 'a',
        updatedAt: Date.now(),
        coverLetter: 'SERVER COVER',
        outreachMessage: 'LOCAL OUTREACH',
      })
    );
    documents.a = { cover_letter: 'SERVER COVER', outreach_message: 'SERVER OUTREACH' };
    route.search = 'id=a&tab=outreach';
    renderBuilder();

    expect(await screen.findByDisplayValue('SERVER OUTREACH')).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: en.builder.draftRecovery.restoreDraft })
    );

    expect(await screen.findByDisplayValue('LOCAL OUTREACH')).toBeInTheDocument();
  });

  it.each([
    ['cover-letter', 'cover_letter'],
    ['outreach', 'outreach_message'],
  ] as const)('%s: an unsaved edit is offered back after the page reloads', async (tab, field) => {
    documents.a = { [field]: 'SERVER' };
    route.search = `id=a&tab=${tab}`;
    const view = renderBuilder();
    fireEvent.change(await screen.findByDisplayValue('SERVER'), {
      target: { value: 'UNSAVED EDIT' },
    });
    view.unmount();

    renderBuilder();
    expect(await screen.findByDisplayValue('SERVER')).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: en.builder.draftRecovery.restoreDraft })
    );

    expect(await screen.findByDisplayValue('UNSAVED EDIT')).toBeInTheDocument();
    expect(saves).toEqual([]);
  });

  it.each([
    ['cover-letter', en.builder.alerts.coverLetterSaveSuccess],
    ['outreach', en.builder.alerts.outreachSaveSuccess],
  ] as const)('%s: Save is ready again once a save finishes', async (tab, success) => {
    documents.a = { cover_letter: 'SERVER', outreach_message: 'SERVER' };
    route.search = `id=a&tab=${tab}`;
    renderBuilder();
    fireEvent.change(await screen.findByDisplayValue('SERVER'), { target: { value: 'EDIT' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));

    expect(await screen.findByText(success)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: en.common.save })).toBeEnabled());
    expect(screen.queryByRole('button', { name: en.common.saving })).toBeNull();
  });
});

it('does not expose attachment state from an unusable resume response', async () => {
  documents.a = {
    cover_letter: 'UNUSABLE COVER',
    processed_resume: null,
    raw_resume: { content: '', processing_status: 'processing' },
  };
  route.search = 'id=a&tab=cover-letter';
  renderBuilder();

  await waitFor(() => expect(resumeGets).toBeGreaterThan(0));
  // Let the response land: the check below must not pass just because it hasn't.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(screen.queryByDisplayValue('UNUSABLE COVER')).not.toBeInTheDocument();
});

describe('builder attachment save ordering', () => {
  const field = (tab: 'cover-letter' | 'outreach') =>
    tab === 'cover-letter' ? 'cover_letter' : 'outreach_message';
  const partSaves = (tab: 'cover-letter' | 'outreach') =>
    saves
      .filter(
        (save) => save.part === (tab === 'cover-letter' ? 'cover-letter' : 'outreach-message')
      )
      .map((save) => save.content);
  const regenerateLabel = (tab: 'cover-letter' | 'outreach') =>
    tab === 'cover-letter' ? en.coverLetter.regenerate : en.outreach.regenerate;
  const regenerate = async (tab: 'cover-letter' | 'outreach') => {
    fireEvent.click(screen.getByRole('button', { name: regenerateLabel(tab) }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: regenerateLabel(tab) }));
  };
  const leaveIsGuarded = () => {
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    return unload.defaultPrevented;
  };

  it('waits for an earlier cover save even after reverting to the acknowledged baseline', async () => {
    documents.a = { cover_letter: 'SERVER COVER' };
    const first = holdNextSave();
    const latest = holdNextSave();
    route.search = 'id=a&tab=cover-letter';
    renderBuilder();
    const editor = await screen.findByDisplayValue('SERVER COVER');
    fireEvent.change(editor, { target: { value: 'INTERMEDIATE' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));
    await waitFor(() => expect(coverSaves()).toEqual(['INTERMEDIATE']));
    fireEvent.change(editor, { target: { value: 'SERVER COVER' } });
    fireEvent.click(screen.getAllByRole('button', { name: en.common.download }).at(-1)!);
    expect(pdfRequests).toEqual([]);

    await act(async () => first.resolve());
    await waitFor(() => expect(coverSaves()).toEqual(['INTERMEDIATE', 'SERVER COVER']));
    expect(pdfRequests).toEqual([]);
    await act(async () => latest.resolve());
    await waitFor(() => expect(pdfRequests).toHaveLength(1));
  });

  it.each(['cover-letter', 'outreach'] as const)(
    'serializes and converges %s edits before Back',
    async (tab) => {
      documents.a = { cover_letter: 'SERVER', outreach_message: 'SERVER' };
      const first = holdNextSave();
      const second = holdNextSave();
      const third = holdNextSave();
      route.search = `id=a&tab=${tab}`;
      renderBuilder();
      const editor = await screen.findByDisplayValue('SERVER');
      fireEvent.change(editor, { target: { value: 'FIRST' } });
      fireEvent.click(screen.getByRole('button', { name: en.common.save }));
      await waitFor(() => expect(partSaves(tab)).toEqual(['FIRST']));
      fireEvent.change(editor, { target: { value: 'SECOND' } });
      fireEvent.click(screen.getByRole('button', { name: en.nav.backToDashboard }));

      expect(partSaves(tab)).toEqual(['FIRST']);
      await act(async () => first.resolve());
      await waitFor(() => expect(partSaves(tab)).toEqual(['FIRST', 'SECOND']));
      fireEvent.change(editor, { target: { value: 'FINAL' } });
      await act(async () => second.resolve());
      await waitFor(() => expect(partSaves(tab)).toEqual(['FIRST', 'SECOND', 'FINAL']));
      expect(router.push).not.toHaveBeenCalled();
      await act(async () => third.resolve());
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'));
    }
  );

  it.each(['cover-letter', 'outreach'] as const)(
    'orders %s generation after prior saves',
    async (tab) => {
      documents.a = { cover_letter: 'SERVER', outreach_message: 'SERVER' };
      const first = holdNextSave();
      const generated = generateLater(tab);
      route.search = `id=a&tab=${tab}`;
      renderBuilder();
      fireEvent.change(await screen.findByDisplayValue('SERVER'), { target: { value: 'EDIT' } });
      fireEvent.click(screen.getByRole('button', { name: en.common.save }));
      await waitFor(() => expect(partSaves(tab)).toEqual(['EDIT']));
      await regenerate(tab);

      expect(generations).toBe(0);
      await act(async () => first.resolve());
      await waitFor(() => expect(generations).toBe(1));
      await act(async () => generated.resolve('GENERATED'));
      expect(await screen.findByDisplayValue('GENERATED')).toBeInTheDocument();
      expect(leaveIsGuarded()).toBe(false);
    }
  );

  describe.each(['cover-letter', 'outreach'] as const)(
    '%s save queued during generation',
    (tab) => {
      it.each(['unchanged', 'edit-before-save', 'edit-after-save'] as const)(
        'keeps server and editor converged for %s content',
        async (editTiming) => {
          documents.a = { cover_letter: 'SERVER', outreach_message: 'SERVER' };
          const generated = generateLater(tab);
          route.search = `id=a&tab=${tab}`;
          renderBuilder();
          const editor = await screen.findByDisplayValue('SERVER');
          await regenerate(tab);
          await waitFor(() => expect(generations).toBe(1));
          expect(editor).toBeEnabled();
          expect(screen.getByRole('button', { name: en.common.save })).toBeEnabled();

          if (editTiming === 'edit-before-save') {
            fireEvent.change(editor, { target: { value: 'LATEST EDIT' } });
          }
          fireEvent.click(screen.getByRole('button', { name: en.common.save }));
          expect(partSaves(tab)).toEqual([]);
          if (editTiming === 'edit-after-save') {
            fireEvent.change(editor, { target: { value: 'LATEST EDIT' } });
          }
          await act(async () => generated.resolve('GENERATED'));

          const expected = editTiming === 'unchanged' ? 'GENERATED' : 'LATEST EDIT';
          await waitFor(() => expect(documents.a[field(tab)]).toBe(expected));
          await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(expected));
          await waitFor(() => expect(leaveIsGuarded()).toBe(false));
        }
      );
    }
  );

  it.each(['cover-letter', 'outreach'] as const)(
    '%s: an edit back to the old text during generation is saved before Back',
    async (tab) => {
      // Generation writes its text to the server, so the editor's text is
      // unsaved again even though it matches what the page first loaded.
      documents.a = { cover_letter: 'SERVER', outreach_message: 'SERVER' };
      const generated = generateLater(tab);
      route.search = `id=a&tab=${tab}`;
      renderBuilder();
      const editor = await screen.findByDisplayValue('SERVER');
      await regenerate(tab);
      await waitFor(() => expect(generations).toBe(1));
      fireEvent.change(editor, { target: { value: 'DRAFT' } });
      fireEvent.change(editor, { target: { value: 'SERVER' } });
      await act(async () => generated.resolve('GENERATED'));
      expect(screen.getByRole('textbox')).toHaveValue('SERVER');
      expect(documents.a[field(tab)]).toBe('GENERATED');

      fireEvent.click(screen.getByRole('button', { name: en.nav.backToDashboard }));

      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'));
      expect(documents.a[field(tab)]).toBe('SERVER');
    }
  );

  it('retains a matching restored attachment backup when replacement storage writes fail', async () => {
    localStorage.setItem(
      'resume_builder_attachment_draft:a',
      JSON.stringify({
        resumeId: 'a',
        updatedAt: Date.now(),
        coverLetter: 'RECOVERABLE',
        outreachMessage: '',
      })
    );
    documents.a = { cover_letter: 'SERVER' };
    failSaves = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    route.search = 'id=a&tab=cover-letter';
    renderBuilder();
    await screen.findByDisplayValue('SERVER');
    const restore = await screen.findByRole('button', {
      name: en.builder.draftRecovery.restoreDraft,
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    fireEvent.click(restore);
    fireEvent.click(screen.getByRole('button', { name: en.nav.backToDashboard }));

    expect(await screen.findByText(en.builder.leaveWithLocalDraft.description)).toBeInTheDocument();
    expect(screen.getByDisplayValue('RECOVERABLE')).toBeInTheDocument();
  });
});

describe('builder attachments in agent mode', () => {
  it.each([
    ['cover-letter', en.agentPrompt.coverLetter.title],
    ['outreach', en.agentPrompt.outreach.title],
    ['interview-prep', en.agentPrompt.interviewPrep.title],
  ] as const)('%s shows a prompt for the agent instead of generating', async (kind, title) => {
    serveBackend({ agentMode: true });
    // Agent mode arrives with /status. The resume (and so the generate control)
    // loads only after /status was answered, so the click below sees agent mode.
    let statusAnswered!: () => void;
    const statusDone = new Promise<void>((resolve) => {
      statusAnswered = resolve;
    });
    server.use(
      // Both fall through to the stubs above: they only order the requests.
      http.get(`${API}/status`, () => {
        statusAnswered();
      }),
      http.get(`${API}/resumes`, async () => {
        await statusDone;
      }),
      http.post(`${API}/resumes/:id/:generate`, () => {
        generations += 1;
        return HttpResponse.json({ content: 'should not be called' });
      })
    );
    route.search = `id=a&tab=${kind}`;
    renderBuilder();
    const button = await screen.findByRole('button', { name: generateLabel(kind) });
    fireEvent.click(button);

    expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument();
    expect(generations).toBe(0);
  });
});
