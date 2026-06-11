import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
} from '@/lib/api/resume-wizard';

describe('resume wizard api', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ state: createInitialResumeWizardState() }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates the expected initial state', () => {
    const state = createInitialResumeWizardState();
    expect(state.step).toBe('intro');
    expect(state.current_question.section).toBe('intro');
    expect(state.current_question.text.length).toBeGreaterThan(0);
    expect(state.resume_data.personalInfo?.name).toBe('');
    expect(state.asked_count).toBe(0);
    expect(state.progress.total).toBe(8);
  });

  it('returns a fresh state object each call (no shared mutable references)', () => {
    const a = createInitialResumeWizardState();
    const b = createInitialResumeWizardState();
    expect(a).not.toBe(b);
    expect(a.history).not.toBe(b.history);
    expect(a.resume_data).not.toBe(b.resume_data);
    expect(a.resume_data.workExperience).not.toBe(b.resume_data.workExperience);
  });

  it('posts a turn to the resume-wizard endpoint', async () => {
    const state = createInitialResumeWizardState();
    await postResumeWizardTurn({ state, action: 'answer', answer: { text: "I'm James." } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/resume-wizard/turn');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.action).toBe('answer');
    expect(body.answer.text).toBe("I'm James.");
    expect(body.state.step).toBe('intro');
  });

  it('throws endpoint text when finalize fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('already exists', { status: 409 }));
    await expect(finalizeResumeWizard(createInitialResumeWizardState())).rejects.toThrow(
      /already exists/
    );
  });
});
