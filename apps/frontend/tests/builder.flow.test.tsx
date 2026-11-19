import { fireEvent, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('next/navigation', async () => (await import('./support/navigation')).navigation);

const server = startMsw(
  ...backgroundHandlers(),
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

beforeEach(() => {
  // findBy*/waitFor hang under fake timers: advance, then use getBy*.
  vi.useFakeTimers();
  route.search = 'id=res-1';
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

  it('a reset during an autosave still sends the reset copy to the server', async () => {
    // The PATCH in flight carries the edit the reset discards, so the server is
    // about to hold text the editor no longer shows.
    answerPatches({ delayMs: 1_000 });
    renderBuilder();
    await advance(0);
    typeName('Ada Byron');
    await advance(2_600); // the autosave PATCH is in flight

    fireEvent.click(screen.getByRole('button', { name: en.common.reset }));
    expect(nameField()).toHaveValue('Ada Lovelace');
    await advance(1_100); // the first PATCH lands
    await advance(3_000); // autosave sends the reset copy

    expect(patches.map((body) => body.personalInfo?.name)).toEqual(['Ada Byron', 'Ada Lovelace']);
  });

  it('a reset clears a failed save', async () => {
    answerPatches({ status: 503 });
    renderBuilder();
    await advance(0);
    typeName('Ada Byron');
    await advance(3_000);
    expect(screen.getByText(en.builder.alerts.autoSaveFailed)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: en.common.reset }));
    await advance(0);

    expect(nameField()).toHaveValue('Ada Lovelace');
    expect(screen.queryByText(en.builder.alerts.autoSaveFailed)).toBeNull();
    expect(
      screen.getByRole('button', { name: en.builder.autoSave.savedButton })
    ).toBeInTheDocument();
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
