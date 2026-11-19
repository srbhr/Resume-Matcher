import { act, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResumeWizardRoute from '@/app/(default)/resume-wizard/page';
import { createInitialResumeWizardState } from '@/lib/api/resume-wizard';
import {
  readResumeWizardCompletion,
  readResumeWizardDraft,
  writeResumeWizardCompletion,
  writeResumeWizardDraft,
} from '@/lib/utils/resume-wizard-storage';
import { startMsw } from './support/msw';
import { installDomShims, removeDomShims } from './support/dom-shims';
import {
  API,
  SERVER_RESUME,
  advance,
  backgroundHandlers,
  click,
  deferred,
  en,
  nameField,
  queryNameField,
  renderBuilder,
  renderPage,
  resumeBody,
  route,
  setDraft,
  typeName,
} from './support/builder-page';

/**
 * Which document the builder shows and saves: switching resume mid-request,
 * late responses, draft-restore consent, and the wizard's completion receipt.
 * Real page and providers; MSW answers the network; only `next/navigation` is
 * mocked. Documents are told apart by the name field (a plain input).
 */

vi.mock('next/navigation', async () => (await import('./support/navigation')).navigation);

const BOB = {
  ...SERVER_RESUME,
  personalInfo: { name: 'Bob', email: 'bob@example.com' },
  summary: 'Bob server baseline',
};

type Patch = { id: string; body: { personalInfo?: { name?: string; email?: string } } };

/** Every PATCH the builder sent, in order. */
let patches: Patch[] = [];

const server = startMsw(...backgroundHandlers());

/** GET /resumes answers per id: res-1 is Ada, res-2 is Bob. */
function serveResumes(
  byId: Record<
    string,
    () => ReturnType<typeof resumeBody> | Promise<ReturnType<typeof resumeBody>>
  > = {}
) {
  server.use(
    http.get(`${API}/resumes`, async ({ request }) => {
      const id = new URL(request.url).searchParams.get('resume_id') ?? '';
      const custom = byId[id];
      if (custom) return HttpResponse.json(await custom());
      return HttpResponse.json(resumeBody(id === 'res-2' ? BOB : SERVER_RESUME, { resume_id: id }));
    })
  );
}

/** PATCHes echo their body; the first one waits for `firstHeld` when given. */
function answerPatches(firstHeld?: Promise<'success' | 'failure'>) {
  let first = true;
  server.use(
    http.patch(`${API}/resumes/:id`, async ({ request, params }) => {
      const patch: Patch = { id: String(params.id), body: {} };
      patches.push(patch);
      const body = (await request.json()) as Patch['body'];
      patch.body = body;
      if (first && firstHeld) {
        first = false;
        if ((await firstHeld) === 'failure') {
          return HttpResponse.json({ detail: 'old resume save failed' }, { status: 500 });
        }
      }
      return HttpResponse.json(resumeBody(body, { resume_id: params.id }));
    })
  );
}

/**
 * Let a save that has started reach the network. The save chain crosses a few
 * timer boundaries after the debounce fires, which `advance(n)` alone doesn't flush.
 */
const settle = () => advance(10);

const failedSaves = () =>
  server.use(
    http.patch(`${API}/resumes/:id`, async ({ request, params }) => {
      patches.push({ id: String(params.id), body: (await request.json()) as Patch['body'] });
      return HttpResponse.json({ detail: 'offline' }, { status: 503 });
    })
  );

beforeEach(() => {
  vi.useFakeTimers();
  installDomShims();
  localStorage.clear();
  route.search = 'id=res-1';
  patches = [];
  serveResumes();
  answerPatches();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  removeDomShims();
});

describe('builder document ownership', () => {
  it('discards a new-resume draft without changing the fresh baseline', async () => {
    route.search = '';
    localStorage.setItem(
      'resume_builder_draft:new',
      JSON.stringify({
        resumeId: null,
        data: { ...SERVER_RESUME, personalInfo: { name: 'discarded draft' } },
        updatedAt: Date.now(),
      })
    );
    renderBuilder();
    await advance();
    const baseline = (nameField() as HTMLInputElement).value;

    await click(en.builder.discardChanges);
    expect(localStorage.getItem('resume_builder_draft:new')).toBeNull();
    expect(nameField()).toHaveValue(baseline);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await advance(20_000);
    expect(patches).toHaveLength(0);
  });

  it('asks before restoring a new-resume local draft and keeps it local after consent', async () => {
    route.search = '';
    localStorage.setItem(
      'resume_builder_draft:new',
      JSON.stringify({
        resumeId: null,
        updatedAt: Date.now(),
        data: { ...SERVER_RESUME, personalInfo: { name: 'unsaved new draft' } },
      })
    );
    renderBuilder();
    await advance(20_000);
    expect(
      screen.getByRole('button', { name: en.builder.draftRecovery.restoreDraft })
    ).toBeVisible();
    expect(nameField()).not.toHaveValue('unsaved new draft');
    expect(patches).toHaveLength(0);

    await click(en.builder.draftRecovery.restoreDraft);
    expect(nameField()).toHaveValue('unsaved new draft');
    await advance(20_000);
    expect(patches).toHaveLength(0);
  });

  it.each([
    ['automatic', 'success'],
    ['manual', 'success'],
    ['automatic', 'failure'],
    ['manual', 'failure'],
  ] as const)(
    'ignores a late %s save (%s) before resetting and saving another resume',
    async (mode, outcome) => {
      const held = deferred<'success' | 'failure'>();
      answerPatches(held.promise);
      const view = renderBuilder();
      await advance();
      typeName('Ada edited');
      if (mode === 'automatic') await advance(2_500);
      else await click(en.builder.autoSave.saveNow);
      await settle();
      expect(patches).toHaveLength(1);

      route.search = 'id=res-2';
      view.rerender();
      await advance();
      expect(nameField()).toHaveValue('Bob');
      await act(async () => held.resolve(outcome));
      await settle();

      typeName('Bob edited');
      await click(en.common.reset);
      expect(nameField()).toHaveValue('Bob');
      typeName('Bob saved');
      await click(en.builder.autoSave.saveNow);
      await settle();
      expect(patches.at(-1)).toEqual({
        id: 'res-2',
        body: expect.objectContaining({
          personalInfo: expect.objectContaining({ name: 'Bob saved', email: 'bob@example.com' }),
        }),
      });
    }
  );

  it('ignores an old GET after another resume has loaded', async () => {
    const old = deferred();
    serveResumes({
      'res-1': async () => {
        await old.promise;
        return resumeBody(SERVER_RESUME);
      },
    });
    const view = renderBuilder();
    route.search = 'id=res-2';
    view.rerender();
    await advance();
    await act(async () => old.resolve());
    await settle();

    expect(nameField()).toHaveValue('Bob');
    typeName('Bob saved');
    await click(en.builder.autoSave.saveNow);
    await settle();
    expect(patches.at(-1)).toEqual({
      id: 'res-2',
      body: expect.objectContaining({
        personalInfo: expect.objectContaining({ email: 'bob@example.com' }),
      }),
    });
  });

  it('keeps a same-document edit dirty when an earlier save completes', async () => {
    const held = deferred<'success' | 'failure'>();
    answerPatches(held.promise);
    renderBuilder();
    await advance();
    typeName('first edit');
    await advance(2_500);
    await settle();
    expect(patches).toHaveLength(1);
    typeName('second edit');

    await act(async () => held.resolve('success'));

    await settle();
    expect(nameField()).toHaveValue('second edit');
    expect(screen.getByRole('button', { name: en.builder.autoSave.saveNow })).toBeEnabled();
    expect(localStorage.getItem('resume_builder_draft:res-1')).toContain('second edit');
  });

  it('does not clear a newer draft after leaving and reopening the same ID', async () => {
    const held = deferred<'success' | 'failure'>();
    answerPatches(held.promise);
    const view = renderBuilder();
    await advance();
    typeName('Ada edited');
    await advance(2_500);
    await settle();
    expect(patches).toHaveLength(1);
    route.search = 'id=res-2';
    view.rerender();
    await advance();

    // A later browser session's draft must not be removed by the abandoned save.
    setDraft('res-1', { ...SERVER_RESUME, personalInfo: { name: 'newer draft while away' } });
    route.search = 'id=res-1';
    view.rerender();
    await advance();
    await click(en.builder.draftRecovery.restoreDraft);
    await act(async () => held.resolve('success'));
    await settle();
    expect(localStorage.getItem('resume_builder_draft:res-1')).toContain('newer draft while away');
  });
});

describe.each([false, true])(
  'draft recovery requires a readable server baseline (unrelated tailor result: %s)',
  (withTailorResult) => {
    const tailorResult = withTailorResult
      ? ({
          data: { request_id: 'r', resume_id: 'another-resume', resume_preview: BOB },
        } as never)
      : undefined;

    it.each([
      [
        'Markdown',
        resumeBody(null, {
          raw_resume: { content: '# raw Markdown', processing_status: 'failed' },
        }),
      ],
      ['invalid JSON shape', resumeBody(null, { raw_resume: { content: '{}' } })],
      ['invalid processed shape', resumeBody({})],
      [
        'processing',
        resumeBody(SERVER_RESUME, {
          raw_resume: { content: '# raw', processing_status: 'processing' },
        }),
      ],
    ])('blocks writes for a %s response and retains a recoverable draft', async (_label, body) => {
      setDraft('res-1', { ...SERVER_RESUME, personalInfo: { name: 'stale draft' } });
      serveResumes({ 'res-1': () => body });
      renderBuilder({ tailorResult });
      await advance(20_000);

      expect(patches).toHaveLength(0);
      expect(screen.getByText(en.builder.alerts.loadFailed)).toBeVisible();
      expect(localStorage.getItem('resume_builder_draft:res-1')).toContain('stale draft');
      expect(queryNameField()).toBeNull();
    });

    it.each(['processed', 'raw JSON'])(
      'requires consent before saving a draft over usable %s',
      async (kind) => {
        setDraft('res-1', { ...SERVER_RESUME, personalInfo: { name: 'approved recovered draft' } });
        serveResumes({
          'res-1': () =>
            kind === 'processed'
              ? resumeBody(SERVER_RESUME)
              : resumeBody(null, { raw_resume: { content: JSON.stringify(SERVER_RESUME) } }),
        });
        renderBuilder({ tailorResult });
        await advance(20_000);
        expect(patches).toHaveLength(0);
        expect(nameField()).toHaveValue('Ada Lovelace');

        await click(en.builder.draftRecovery.restoreDraft);
        await advance(2_500);
        await settle();
        expect(patches.at(-1)).toEqual({
          id: 'res-1',
          body: expect.objectContaining({
            personalInfo: expect.objectContaining({ name: 'approved recovered draft' }),
          }),
        });
      }
    );
  }
);

it.each(['legacy pending', 'partial raw JSON'])('loads a usable %s baseline', async (kind) => {
  serveResumes({
    'res-1': () =>
      kind === 'legacy pending'
        ? resumeBody(SERVER_RESUME, { raw_resume: { processing_status: 'pending' } })
        : resumeBody(null, {
            raw_resume: {
              content: JSON.stringify({ personalInfo: { name: 'Partial editable resume' } }),
            },
          }),
  });
  renderBuilder();
  await advance();
  expect(nameField()).toHaveValue(
    kind === 'legacy pending' ? 'Ada Lovelace' : 'Partial editable resume'
  );
  expect(screen.queryByText(en.builder.alerts.loadFailed)).toBeNull();
});

it('does not claim a restored backup if its source disappeared and the scoped write fails', async () => {
  setDraft('res-1', { ...SERVER_RESUME, personalInfo: { name: 'RECOVERED' } });
  failedSaves();
  renderBuilder();
  await advance();
  localStorage.removeItem('resume_builder_draft:res-1');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });

  await click(en.builder.draftRecovery.restoreDraft);
  expect(screen.queryByText(en.builder.autoSave.localDraft)).not.toBeInTheDocument();
  expect(nameField()).toHaveValue('RECOVERED');
});

describe("builder acknowledgement of the wizard's completion receipt", () => {
  const renderWizard = () => renderPage(<ResumeWizardRoute />);

  it.each(['processed', 'raw JSON'])(
    'retires the matching receipt only after a validated %s baseline loads, enabling a fresh wizard',
    async (kind) => {
      writeResumeWizardCompletion('res-1');
      const load = deferred();
      serveResumes({
        'res-1': async () => {
          await load.promise;
          return kind === 'processed'
            ? resumeBody(SERVER_RESUME)
            : resumeBody(null, { raw_resume: { content: JSON.stringify(SERVER_RESUME) } });
        },
      });
      const view = renderBuilder();
      await advance();
      expect(readResumeWizardCompletion()).toBe('res-1');
      expect(nameField()).not.toHaveValue('Ada Lovelace');

      await act(async () => load.resolve());

      await settle();
      expect(nameField()).toHaveValue('Ada Lovelace');
      expect(readResumeWizardCompletion()).toBeNull();

      view.unmount();
      renderWizard();
      await advance();
      expect(screen.getByRole('textbox')).toBeVisible();
      expect(screen.queryByText(en.resumeWizard.created.title)).toBeNull();
    }
  );

  it.each(['request failure', 'invalid processed shape', 'invalid raw JSON', 'processing'])(
    'retains the receipt and wizard recovery after a %s',
    async (kind) => {
      writeResumeWizardCompletion('res-1');
      if (kind === 'request failure') {
        server.use(
          http.get(`${API}/resumes`, () =>
            HttpResponse.json({ detail: 'offline' }, { status: 503 })
          )
        );
      } else {
        serveResumes({
          'res-1': () =>
            kind === 'invalid processed shape'
              ? resumeBody({})
              : kind === 'invalid raw JSON'
                ? resumeBody(null, { raw_resume: { content: '{}' } })
                : resumeBody(SERVER_RESUME, { raw_resume: { processing_status: 'processing' } }),
        });
      }
      const view = renderBuilder();
      await advance();
      expect(screen.getByText(en.builder.alerts.loadFailed)).toBeVisible();
      expect(readResumeWizardCompletion()).toBe('res-1');

      view.unmount();
      renderWizard();
      await advance();
      expect(
        screen.getByRole('button', { name: en.resumeWizard.actions.openCreated })
      ).toBeVisible();
    }
  );

  it.each(['draft', 'receipt'] as const)(
    'preserves a newer %s written while the matching resume load is pending',
    async (kind) => {
      writeResumeWizardCompletion('res-1');
      const load = deferred();
      serveResumes({
        'res-1': async () => {
          await load.promise;
          return resumeBody(SERVER_RESUME);
        },
      });
      renderBuilder();
      await advance();
      if (kind === 'draft') {
        const state = createInitialResumeWizardState();
        state.current_question.text = 'Newer wizard question';
        writeResumeWizardDraft(state);
      } else {
        writeResumeWizardCompletion('res-2');
      }

      await act(async () => load.resolve());

      await settle();
      expect(nameField()).toHaveValue('Ada Lovelace');
      if (kind === 'draft') {
        expect(readResumeWizardDraft()?.current_question.text).toBe('Newer wizard question');
      } else {
        expect(readResumeWizardCompletion()).toBe('res-2');
      }
    }
  );

  it('preserves an unrelated receipt when another resume loads', async () => {
    writeResumeWizardCompletion('res-2');
    renderBuilder();
    await advance();
    expect(nameField()).toHaveValue('Ada Lovelace');
    expect(readResumeWizardCompletion()).toBe('res-2');
  });

  it('preserves the receipt if the builder unmounts before its baseline arrives', async () => {
    writeResumeWizardCompletion('res-1');
    const load = deferred();
    serveResumes({
      'res-1': async () => {
        await load.promise;
        return resumeBody(SERVER_RESUME);
      },
    });
    const view = renderBuilder();
    await advance();
    view.unmount();
    await act(async () => load.resolve());
    await settle();
    await advance();
    expect(readResumeWizardCompletion()).toBe('res-1');
  });

  it('can retire the receipt on a later loaded visit after storage recovers', async () => {
    writeResumeWizardCompletion('res-1');
    const originalRemove = Storage.prototype.removeItem;
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    remove.mockImplementation(function (this: Storage, key: string) {
      if (key === 'resume_wizard_draft') throw new Error('Storage unavailable');
      originalRemove.call(this, key);
    });
    const first = renderBuilder();
    await advance();
    expect(nameField()).toHaveValue('Ada Lovelace');
    expect(readResumeWizardCompletion()).toBe('res-1');
    first.unmount();

    remove.mockRestore();
    renderBuilder();
    await advance();
    expect(nameField()).toHaveValue('Ada Lovelace');
    expect(readResumeWizardCompletion()).toBeNull();
  });
});
