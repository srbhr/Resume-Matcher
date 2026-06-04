import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
} from '@/lib/api/resume-wizard';

describe('resume wizard api', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
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

  it('posts a turn to the resume-wizard endpoint', async () => {
    const state = createInitialResumeWizardState();
    await postResumeWizardTurn({ state, action: 'answer', answer: { text: "I'm James." } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/resume-wizard/turn');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).answer.text).toBe("I'm James.");
  });

  it('throws endpoint text when finalize fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('already exists', { status: 409 }));
    await expect(finalizeResumeWizard(createInitialResumeWizardState())).rejects.toThrow(
      /already exists/
    );
  });
});
