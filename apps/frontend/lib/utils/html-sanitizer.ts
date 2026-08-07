/**
 * Whitelist of allowed HTML tags for rich text content.
 */
const ALLOWED_TAGS = ['strong', 'em', 'u', 'a'] as const;

/**
 * Whitelist of allowed HTML attributes.
 */
const ALLOWED_ATTRS = ['href', 'target', 'rel'] as const;

const SAFE_REL_VALUES = new Set(['noopener', 'noreferrer', 'nofollow', 'external', 'ugc', 'sponsored']);
const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'svg', 'math', 'img', 'video', 'audio', 'source', 'track', 'canvas', 'form', 'input', 'button', 'select', 'textarea', 'option', 'noscript']);

/**
 * Sanitizes HTML content with a strict whitelist.
 * Only allows bold, italic, underline, and link formatting.
 *
 * @param dirty - The unsanitized HTML string
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) {
    return '';
  }

  let skipDepth = 0;
  let currentBlockedTag = '';

  return dirty.replace(/<!--([\s\S]*?)-->|<\/?([a-zA-Z0-9:-]+)([^>]*)>/g, (match, comment, tagName, attributes) => {
    if (comment !== undefined) {
      return '';
    }

    const normalizedTag = tagName.toLowerCase();
    const isClosingTag = match.startsWith('</');

    if (skipDepth > 0) {
      if (isClosingTag && normalizedTag === currentBlockedTag) {
        skipDepth -= 1;
        currentBlockedTag = skipDepth > 0 ? currentBlockedTag : '';
      }
      return '';
    }

    if (BLOCKED_TAGS.has(normalizedTag)) {
      if (!isClosingTag) {
        skipDepth = 1;
        currentBlockedTag = normalizedTag;
      }
      return '';
    }

    if (!ALLOWED_TAGS.includes(normalizedTag as (typeof ALLOWED_TAGS)[number])) {
      return '';
    }

    if (isClosingTag) {
      return `</${normalizedTag}>`;
    }

    if (normalizedTag === 'a') {
      const sanitizedAttrs = sanitizeAttributes(attributes);
      return sanitizedAttrs ? `<a${sanitizedAttrs}>` : '<a>';
    }

    return `<${normalizedTag}>`;
  });
}

function sanitizeAttributes(attributes: string): string {
  if (!attributes) {
    return '';
  }

  const cleaned: string[] = [];
  const attrPattern = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(attributes)) !== null) {
    const [, rawName, doubleQuoted, singleQuoted, bareValue] = match;
    const name = rawName.toLowerCase();
    const value = doubleQuoted ?? singleQuoted ?? bareValue ?? '';

    if (!ALLOWED_ATTRS.includes(name as (typeof ALLOWED_ATTRS)[number])) {
      continue;
    }

    if (name === 'href') {
      if (!isSafeUrl(value)) {
        continue;
      }

      cleaned.push(` href="${escapeAttribute(value)}"`);
      continue;
    }

    if (name === 'target') {
      const normalizedTarget = value.trim().toLowerCase();
      if (['_blank', '_self', '_parent', '_top'].includes(normalizedTarget)) {
        cleaned.push(` target="${normalizedTarget}"`);
      }
      continue;
    }

    if (name === 'rel') {
      const normalizedRel = normalizeRel(value);
      if (normalizedRel) {
        cleaned.push(` rel="${normalizedRel}"`);
      }
    }
  }

  return cleaned.join('');
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  return !['javascript:', 'data:', 'vbscript:'].some((prefix) => normalized.startsWith(prefix));
}

function normalizeRel(value: string): string {
  return value
    .split(/\s+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item && SAFE_REL_VALUES.has(item))
    .join(' ');
}

function escapeAttribute(value: string): string {
  return value.replace(/"/g, '&quot;');
}
