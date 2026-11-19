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

const server = startMsw();

function serveBackend() {
  server.use(
    ...backgroundHandlers(),
    http.get(`${API}/resumes`, ({ request }) => {
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
    http.get(`${API}/resumes/:id/ats-score`, () => HttpResponse.json(null))
  );
}

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
