import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';

/**
 * sanitizeHtml guards every `dangerouslySetInnerHTML` sink (rich-text bullets,
 * LLM output). Whitelist: strong/em/u/a + href/target/rel. Anything else must go.
 */

describe('sanitizeHtml', () => {
  it('keeps whitelisted formatting tags', () => {
    const out = sanitizeHtml('<strong>bold</strong> <em>italic</em> <u>under</u>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<u>under</u>');
  });

  it('keeps anchor href', () => {
    const out = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('link');
  });

  it('strips <script> entirely (tag + content)', () => {
    const out = sanitizeHtml('<script>alert(1)</script>safe');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
    expect(out).toContain('safe');
  });

  it('strips event-handler attributes but keeps the element text', () => {
    const out = sanitizeHtml('<a href="https://x.com" onclick="evil()">click</a>');
    expect(out).not.toContain('onclick');
    expect(out).toContain('click');
  });

  it('removes a non-whitelisted tag while keeping its text', () => {
    const out = sanitizeHtml('<div>plain text</div>');
    expect(out).not.toContain('<div>');
    expect(out).toContain('plain text');
  });

  it('drops dangerous tags like <img onerror>', () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('img');
    expect(out).not.toContain('onerror');
  });
});
