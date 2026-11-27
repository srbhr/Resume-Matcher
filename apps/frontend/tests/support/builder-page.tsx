import { act, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useEffect, type ReactNode } from 'react';
import { vi } from 'vitest';
import DefaultLayout from '@/app/(default)/layout';
import BuilderPage from '@/app/(default)/builder/page';
import {
  useResumePreview,
  type ImprovedResult,
} from '@/components/common/resume_previewer_context';
import en from '@/messages/en.json';

// The builder loads these panels with next/dynamic. Loaded here first, each
// dynamic import resolves from the module cache, so advance() flushes it the
// way a fetched chunk lands in the browser.
import '@/components/builder/cover-letter-editor';
import '@/components/builder/outreach-editor';
import '@/components/builder/cover-letter-preview';
import '@/components/builder/outreach-preview';
import '@/components/builder/interview-prep-view';
import '@/components/builder/jd-comparison-view';
import '@/components/builder/ats-check-view';
import '@/components/builder/writing-panel';
import '@/components/builder/ats-score-panel';
import '@/components/builder/regenerate-wizard';

/**
 * The /builder page as a user meets it: the real route, layout, providers and
 * editor tree. Spec files mock only `next/navigation`, with
 * `vi.mock('next/navigation', async () => (await import('./support/navigation')).navigation)`.
 */

export const API = '/api/v1';

export { route, router } from './navigation';

export const SERVER_RESUME = {
  personalInfo: { name: 'Ada Lovelace', email: 'ada@example.com' },
  summary: 'Real summary from the server',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
};

/** A `GET /resumes` (and PATCH) response body; `data` overrides any field. */
export const resumeBody = (processed: unknown, data: Record<string, unknown> = {}) => ({
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
    ...data,
  },
});

/** The calls the layout's providers make on their own, and the builder's photo load. */
export const backgroundHandlers = ({ agentMode = false } = {}) => [
  // No photo unless a spec says otherwise (photo specs override this route).
  http.get(`${API}/resumes/:id/photo`, () => HttpResponse.json({ photo: null })),
  http.get(`${API}/status`, () =>
    HttpResponse.json({
      status: 'ready',
      llm_configured: true,
      llm_healthy: true,
      agent_mode: agentMode,
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
  // The status cache polls the provider every 10s to notice agent mode, so
  // this must agree with `/status` or the mode flips mid-test.
  http.get(`${API}/config/llm-api-key`, () =>
    HttpResponse.json({
      provider: agentMode ? 'agent' : 'openai',
      model: 'gpt-4o-mini',
      api_key: '',
      api_base: null,
      reasoning_effort: null,
    })
  ),
];

/** Puts tailor-flow output into the real preview context, as the tailor page does. */
function SeedTailorResult({ result }: { result: ImprovedResult }) {
  const { setImprovedData } = useResumePreview();
  useEffect(() => setImprovedData(result), [result, setImprovedData]);
  return null;
}

/** Render a page of the (default) group inside its real layout. */
export function renderPage(
  page: ReactNode,
  { tailorResult }: { tailorResult?: ImprovedResult } = {}
) {
  const tree = () => (
    <DefaultLayout>
      {tailorResult && <SeedTailorResult result={tailorResult} />}
      {page}
    </DefaultLayout>
  );
  const view = render(tree());
  return { ...view, rerender: () => view.rerender(tree()) };
}

export const renderBuilder = (options?: { tailorResult?: ImprovedResult }) =>
  renderPage(<BuilderPage />, options);

/** Advance fake timers. findBy* and waitFor hang under fake timers: advance, then use getBy*. */
export const advance = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

export const nameField = () => screen.getByLabelText(en.resume.personalInfo.name);
export const queryNameField = () => screen.queryByLabelText(en.resume.personalInfo.name);

export function typeName(value: string) {
  fireEvent.change(nameField(), { target: { value } });
}

export const click = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

/** A promise the test settles by hand, to control the order responses land in. */
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

export const setDraft = (id: string, data: unknown) =>
  localStorage.setItem(
    `resume_builder_draft:${id}`,
    JSON.stringify({ resumeId: id, updatedAt: Date.now(), data })
  );

export { en };
