import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * Whitelist of allowed HTML tags for rich text content
 */
const ALLOWED_TAGS = ['strong', 'em', 'u', 'a'];

/**
 * Whitelist of allowed HTML attributes
 */
const ALLOWED_ATTR = ['href', 'target', 'rel'];

/**
 * Sanitizes HTML content using DOMPurify with a strict whitelist.
 * Only allows bold, italic, underline, and link formatting.
 *
 * @param dirty - The unsanitized HTML string
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHtml(dirty: string): string {
  // Handle server-side rendering using JSDOM + DOMPurify
  if (typeof window === 'undefined') {
    const dom = new JSDOM('<!DOCTYPE html>');
    const purify = DOMPurify(dom.window as unknown as Window);
    return purify.sanitize(dirty, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      FORCE_BODY: true,
    });
  }

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORCE_BODY: true,
  });
}

/**
 * Strips all HTML tags from content, returning plain text.
 *
 * @param html - HTML string to strip
 * @returns Plain text with all tags removed
 */
export function stripHtml(html: string): string {
  if (typeof window === 'undefined') {
    // Robust server-side fallback for SSR: parse HTML and extract text content
    const dom = new JSDOM(html);
    return dom.window.document.body.textContent || '';
  }

  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
}

/**
 * Checks if a string contains HTML tags.
 *
 * @param text - String to check
 * @returns True if the string contains HTML tags
 */
export function isHtmlContent(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}
