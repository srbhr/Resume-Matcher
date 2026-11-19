import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateSettings } from '@/lib/types/template-settings';
import { startMsw } from './support/msw';
import { installDomShims, removeDomShims } from './support/dom-shims';
import {
  API,
  SERVER_RESUME,
  backgroundHandlers,
  en,
  renderBuilder,
  resumeBody,
  route,
} from './support/builder-page';

/**
 * Each resume's own formatting in the builder: applied when it loads, saved
 * when changed (also on close and unload), ignored before the resume is known.
 * Real page and formatting controls; MSW answers the network.
 */

vi.mock('next/navigation', async () => (await import('./support/navigation')).navigation);

const SAVED: TemplateSettings = { ...DEFAULT_TEMPLATE_SETTINGS, template: 'swiss-two-column' };

type Save = TemplateSettings & { session: string; revision: number };
let saves: Save[] = [];

const server = startMsw();

function serveResume(
  templateSettings: TemplateSettings | Record<string, unknown> | null,
  { hold = false } = {}
) {
  server.use(
    ...backgroundHandlers(),
    http.get(`${API}/resumes`, async () => {
      if (hold) await new Promise(() => undefined);
      return HttpResponse.json(
        resumeBody(SERVER_RESUME, { resume_id: 'a', template_settings: templateSettings })
      );
    }),
    http.patch(`${API}/resumes/:id/template-settings`, async ({ request }) => {
      const body = (await request.json()) as Save;
      saves.push(body);
      return HttpResponse.json(body);
    })
  );
}

/** The template the preview renders: its root carries `resume-template-<id>`. */
function shownTemplate(): string | undefined {
  const root = document.querySelector('[class*="resume-template-"]');
  return root?.className.match(/resume-template-([\w-]+)/)?.[1];
}

async function loaded() {
  await screen.findByDisplayValue('Ada Lovelace');
}

function pickTemplate(name: string) {
  const toggle = screen.getByRole('button', { name: en.builder.formatting.panelTitle });
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle);
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${name}`) }));
}

const VIVID_SINGLE = en.builder.formatting.templates.vividSingle.name;
const LATEX = en.builder.formatting.templates.latex.name;

beforeEach(() => {
  installDomShims();
  localStorage.clear();
  route.search = 'id=a';
  saves = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  removeDomShims();
});

describe('builder template settings', () => {
  it("applies the resume's saved formatting when it loads", async () => {
    serveResume(SAVED);
    renderBuilder();
    await loaded();

    await waitFor(() => expect(shownTemplate()).toBe('swiss-two-column'));
    expect(saves).toEqual([]);
  });

  it('opens a never-formatted resume in the default template', async () => {
    // A browser-wide setting from older versions must not leak into this resume.
    localStorage.setItem('resume_builder_settings', JSON.stringify({ template: 'modern' }));
    serveResume(null);
    renderBuilder();
    await loaded();

    expect(shownTemplate()).toBe('swiss-single');
  });

  it('saves a formatting change to this resume', async () => {
    serveResume(null);
    renderBuilder();
    await loaded();

    pickTemplate(VIVID_SINGLE);

    expect(shownTemplate()).toBe('vivid-single');
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toEqual({
      ...DEFAULT_TEMPLATE_SETTINGS,
      template: 'vivid-single',
      session: expect.any(String),
      revision: expect.any(Number),
    });
  });

  it('saves a pending formatting change when the builder closes', async () => {
    serveResume(null);
    const view = renderBuilder();
    await loaded();

    pickTemplate(VIVID_SINGLE);
    view.unmount();

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0].template).toBe('vivid-single');
  });

  it('ignores formatting changes until the resume has loaded', async () => {
    // The resume never arrives: its saved formatting is still unknown.
    serveResume(null, { hold: true });
    renderBuilder();
    await screen.findByRole('button', { name: en.builder.formatting.panelTitle });

    pickTemplate(VIVID_SINGLE);
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(shownTemplate()).toBe('swiss-single');
    expect(saves).toEqual([]);
  });

  it("numbers this session's formatting saves in order", async () => {
    serveResume({ ...SAVED, session: 'another-device', revision: 99 });
    renderBuilder();
    await loaded();
    await waitFor(() => expect(shownTemplate()).toBe('swiss-two-column'));

    pickTemplate(VIVID_SINGLE);
    await waitFor(() => expect(saves).toHaveLength(1));
    pickTemplate(LATEX);
    await waitFor(() => expect(saves).toHaveLength(2));

    const [first, second] = saves;
    expect([first.template, second.template]).toEqual(['vivid-single', 'latex']);
    // One session of its own (not the stored device's), counting up.
    expect(first.session).toBeTruthy();
    expect(first.session).not.toBe('another-device');
    expect(second.session).toBe(first.session);
    expect(second.revision).toBeGreaterThan(first.revision);
  });

  it('sends a pending formatting change right away when the page unloads', async () => {
    serveResume(null);
    renderBuilder();
    await loaded();

    pickTemplate(VIVID_SINGLE);
    window.dispatchEvent(new Event('pagehide'));

    // Well inside the 600 ms debounce: only the unload path can have sent it.
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 300 });
    expect(saves[0].template).toBe('vivid-single');
  });
});
