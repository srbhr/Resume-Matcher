import DOMPurify from 'dompurify';

// In a Next.js (SSR) environment, DOMPurify can operate in JSDOM-like mode if window not present.
// Provide a safe wrapper that falls back to basic escaping if purification fails.
export function sanitizeHtml(input: string | undefined | null): string {
  if (!input) return '';
  try {
    if (typeof window === 'undefined') {
      // Server side: minimal strip of script/style tags as defensive measure
      return input.replace(/<\/(script|style)>/gi, '')
                  .replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '')
                  .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
                  .replace(/javascript:/gi, '');
    }
    return DOMPurify.sanitize(input, { USE_PROFILES: { html: true } });
  } catch {
    return input.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  }
}
