import { act, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DefaultLayout from '@/app/(default)/layout';
import BuilderPage from '@/app/(default)/builder/page';
import en from '@/messages/en.json';
import { startMsw } from './support/msw';
import { installDomShims, removeDomShims } from './support/dom-shims';

/**
 * The builder's save rules at the page boundary: the real route, layout,
 * providers and editor tree, with MSW answering the network. Only
 * `next/navigation` is mocked. Nothing here names a hook or module inside the
 * builder, so these cases survive a rewrite of its internals.
 *
 * Case IDs are the data-loss defects from the 2026-07-28 review:
 *   B-01 a save before the server copy has loaded overwrites it with placeholders
 *   B-02 a failed load restores a stale draft and autosaves it
 *   H-01 the debounce collapses to 0 and sends one PATCH per keystroke
 *   H-02 clearing this resume's draft deletes another resume's legacy draft
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('id=res-1'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/builder',
}));

const API = '/api/v1';

const SERVER_RESUME = {
  personalInfo: { name: 'Ada Lovelace', email: 'ada@example.com' },
  summary: 'Real summary from the server',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
};

const resumeBody = (processed: unknown) => ({
  request_id: 'req',
  data: {
    resume_id: 'res-1',
    raw_resume: {
      id: 1,
      content: '',
      content_type: 'md',
      created_at: '2026-01-01T00:00:00Z',
      processing_status: 'ready',
    },
    processed_resume: processed,
    parent_id: null,
    title: 'r',
  },
});

const server = startMsw(
  http.get(`${API}/status`, () =>
    HttpResponse.json({
      status: 'ready',
      llm_configured: true,
      llm_healthy: true,
      agent_mode: false,
      has_master_resume: true,
      database_stats: {
        total_resumes: 1,
        total_jobs: 0,
        total_improvements: 0,
        has_master_resume: true,
      },
    })
  ),
  http.get(`${API}/config/language`, () =>
    HttpResponse.json({ ui_language: 'en', content_language: 'en' })
  ),
  // The status cache polls the provider every 10s to notice agent mode.
  http.get(`${API}/config/llm-api-key`, () =>
    HttpResponse.json({
      provider: 'openai',
      model: 'gpt-4o-mini',
      api_key: '',
      api_base: null,
      reasoning_effort: null,
    })
  ),
  http.get(`${API}/resumes`, () => HttpResponse.json(resumeBody(SERVER_RESUME)))
);

/** Every PATCH body the builder sent, in order. */
let patches: Array<{ personalInfo?: { name?: string } }> = [];

function answerPatches({ delayMs = 0, status = 200 } = {}) {
  server.use(
    http.patch(`${API}/resumes/:id`, async ({ request }) => {
      const body = (await request.json()) as (typeof patches)[number];
      patches.push(body);
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (status !== 200) return HttpResponse.json({ detail: 'offline' }, { status });
      return HttpResponse.json(resumeBody(body));
    })
  );
}

/** Hold the resume GET open until the returned function is called. */
function holdResumeLoad(): () => void {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get(`${API}/resumes`, async () => {
      await released;
      return HttpResponse.json(resumeBody(SERVER_RESUME));
    })
  );
  return release;
}

function renderBuilder() {
  render(
    <DefaultLayout>
      <BuilderPage />
    </DefaultLayout>
  );
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function typeName(value: string) {
  fireEvent.change(screen.getByLabelText(en.resume.personalInfo.name), { target: { value } });
}

beforeEach(() => {
  // findBy*/waitFor hang under fake timers: advance, then use getBy*.
  vi.useFakeTimers();
  installDomShims();
  localStorage.clear();
  patches = [];
  answerPatches();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  removeDomShims();
});

describe('builder: saving at the page boundary', () => {
  it('B-01: does not autosave over the server copy before it has loaded', async () => {
    const release = holdResumeLoad();
    renderBuilder();
    await advance(0);

    // The user types over the placeholders while the GET is still in flight.
    typeName('Typed before load');
    await advance(15_000);
    expect(patches).toHaveLength(0);

    // Once loaded, autosave works again and sends the new edit.
    release();
    await advance(0);
    typeName('Ada Byron');
    await advance(5_000);
    expect(patches.map((p) => p.personalInfo?.name)).toEqual(['Ada Byron']);
  });

  it('B-01b: no manual save path PATCHes before the server copy has loaded', async () => {
    holdResumeLoad();
    renderBuilder();
    await advance(0);
    typeName('Typed before load');

    expect(screen.getByRole('button', { name: en.builder.autoSave.saveNow })).toBeDisabled();
    // Back stays enabled and flushes the same full-document PATCH before leaving.
    fireEvent.click(screen.getByRole('button', { name: en.nav.backToDashboard }));
    await advance(1_000);
    expect(patches).toHaveLength(0);
  });

  it('B-02: a failed load does not restore a stale draft or autosave it', async () => {
    localStorage.setItem(
      'resume_builder_draft:res-1',
      JSON.stringify({
        resumeId: 'res-1',
        updatedAt: Date.now() - 86_400_000,
        data: { ...SERVER_RESUME, personalInfo: { name: 'Stale draft from Monday' } },
      })
    );
    server.use(
      http.get(`${API}/resumes`, () =>
        HttpResponse.json({ detail: 'backend restarting' }, { status: 500 })
      )
    );
    renderBuilder();
    await advance(20_000);

    expect(patches).toHaveLength(0);
    expect(screen.getByText(en.builder.alerts.loadFailed)).toBeVisible();
    expect(screen.queryByDisplayValue('Stale draft from Monday')).toBeNull();
  });

  it('H-01: the debounce does not collapse to zero while typing over a slow link', async () => {
    // A 1s save means an edit lands while the PATCH is in flight. The buggy
    // code then never reset its "unsynced since" marker and pinned the delay at 0.
    answerPatches({ delayMs: 1_000 });
    renderBuilder();
    await advance(0);

    // Type steadily for 24s, well past the 12s max wait.
    for (let i = 0; i < 40; i += 1) {
      typeName(`Ada ${i}`);
      await advance(600);
    }

    // A 2.5s debounce allows a handful of saves; a 0 delay sends one per keystroke.
    expect(patches.length).toBeGreaterThan(0);
    expect(patches.length).toBeLessThanOrEqual(4);
  });

  it("H-02: loading a resume leaves another resume's legacy draft intact", async () => {
    const legacy = JSON.stringify({ ...SERVER_RESUME, summary: 'unsaved new resume' });
    localStorage.setItem('resume_builder_draft', legacy);
    renderBuilder();
    await advance(1_000);

    expect(localStorage.getItem('resume_builder_draft')).toBe(legacy);
  });

  it('announces the save status through one live region, not one nested in another', async () => {
    renderBuilder();
    await advance(0);
    typeName('Ada Byron');
    await advance(0);

    const region = screen.getByText(en.builder.autoSave.localDraft).closest('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.parentElement?.closest('[role="status"]')).toBeNull();
  });

  it('warns truthfully on leave when neither the server nor the browser has the edit', async () => {
    answerPatches({ status: 503 });
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith('resume_builder_draft:')) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    });
    renderBuilder();
    await advance(0);
    typeName('Ada Byron');
    await advance(0);

    expect(screen.getByText(en.builder.autoSave.localDraftUnavailable)).toBeVisible();
    expect(localStorage.getItem('resume_builder_draft:res-1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: en.nav.backToDashboard }));
    await advance(0);
    expect(screen.getByText(en.builder.leaveWithoutDraft.description)).toBeVisible();
  });
});
