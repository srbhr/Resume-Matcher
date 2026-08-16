import { describe, expect, it } from 'vitest';
import { getPreviewErrorMessage } from '@/lib/utils/preview-error';

/**
 * T-06: four branches shipped with zero coverage, from a PR whose stated
 * purpose was improving this exact feedback.
 */

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe('getPreviewErrorMessage', () => {
  it.each([
    ['invalid api key supplied', 'tailor.errors.apiKeyError'],
    ['Unauthorized', 'tailor.errors.apiKeyError'],
    ['authentication failed', 'tailor.errors.apiKeyError'],
    ['Request failed with status 401', 'tailor.errors.apiKeyError'],
  ])('maps auth failures (%s)', (message, expected) => {
    expect(getPreviewErrorMessage(new Error(message), t)).toBe(expected);
  });

  it.each([
    ['rate limit exceeded', 'tailor.errors.rateLimit'],
    ['insufficient_quota', 'tailor.errors.rateLimit'],
    ['Request failed with status 429', 'tailor.errors.rateLimit'],
  ])('maps quota failures (%s)', (message, expected) => {
    expect(getPreviewErrorMessage(new Error(message), t)).toBe(expected);
  });

  it.each([
    'The operation timed out',
    'timeout of 240000ms exceeded',
    'signal is aborted without reason',
    'AbortError',
    'Gateway responded 504',
  ])('maps timeouts (%s)', (message) => {
    const out = getPreviewErrorMessage(new Error(message), t, 240_000);
    expect(out).toBe('tailor.errors.timeout:{"minutes":4}');
  });

  it('derives the reported duration from the configured timeout, not a literal', () => {
    // A local-LLM user on a 15 minute timeout must not be told "4 minutes".
    const out = getPreviewErrorMessage(new Error('timed out'), t, 900_000);
    expect(out).toBe('tailor.errors.timeout:{"minutes":15}');
  });

  it('falls back to the generic message', () => {
    expect(getPreviewErrorMessage(new Error('kaboom'), t)).toBe('tailor.errors.failedToPreview');
  });

  it('handles non-Error throwables without crashing', () => {
    expect(getPreviewErrorMessage('rate limit hit', t)).toBe('tailor.errors.rateLimit');
    expect(getPreviewErrorMessage(null, t)).toBe('tailor.errors.failedToPreview');
    expect(getPreviewErrorMessage(undefined, t)).toBe('tailor.errors.failedToPreview');
  });
});
