import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLastAtsScore, recalculateAtsScore } from '@/lib/api/resume';

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
  );
}

const record = {
  score: {
    overall_score: 70,
    sub_scores: { keyword_match: 70, skills_coverage: 70, section_completeness: 100 },
    missing_keywords: [],
    injectable_keywords: [],
    recommendations: [],
  },
  calculated_at: '2026-10-10T10:00:00+00:00',
};

describe('ATS score api client', () => {
  it('returns the stored record', async () => {
    respond(200, record);
    await expect(fetchLastAtsScore('r1')).resolves.toEqual(record);
  });

  it('returns null when the score was never calculated', async () => {
    respond(200, null);
    await expect(fetchLastAtsScore('r1')).resolves.toBeNull();
  });

  it('treats a 404 as an error, not as "never calculated"', async () => {
    respond(404, { detail: 'Resume not found' });
    await expect(fetchLastAtsScore('missing')).rejects.toThrow('status 404');
  });

  it('posts to recalculate', async () => {
    respond(200, record);
    await expect(recalculateAtsScore('r1')).resolves.toEqual(record);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toMatch(/\/resumes\/r1\/ats-score$/);
    expect((init as RequestInit).method).toBe('POST');
  });
});
