import { DEFAULT_TIMEOUT_MS } from '@/lib/api/client';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Map a tailor-preview failure to a user-facing message key.
 *
 * Extracted from the tailor page so the branches are unit-testable (T-06): the
 * PR that introduced this logic was titled "improve tailor preview timeout
 * feedback" and shipped with no coverage of any branch.
 *
 * Detection is deliberately loose — the message text comes from fetch, the
 * proxy, an AbortController and several LLM providers, none of which agree on
 * wording. `AbortError` / "signal is aborted" matter specifically: a client-side
 * timeout surfaces that way and used to fall through to the generic message.
 */
export function getPreviewErrorMessage(
  err: unknown,
  t: Translate,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): string {
  const errorMessage = err instanceof Error ? err.message : String(err ?? '');
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes('api key') ||
    normalized.includes('unauthorized') ||
    normalized.includes('authentication') ||
    normalized.includes('401')
  ) {
    return t('tailor.errors.apiKeyError');
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('insufficient_quota') ||
    normalized.includes('429')
  ) {
    return t('tailor.errors.rateLimit');
  }

  if (
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('signal is aborted') ||
    normalized.includes('aborterror') ||
    normalized.includes('504')
  ) {
    // Report the timeout the app is actually configured with, not a literal.
    // DEFAULT_TIMEOUT_MS is driven by NEXT_PUBLIC_REQUEST_TIMEOUT_MS and is
    // deliberately shared with the backend and the Next proxy.
    return t('tailor.errors.timeout', {
      minutes: Math.round(timeoutMs / 60_000),
    });
  }

  return t('tailor.errors.failedToPreview');
}
