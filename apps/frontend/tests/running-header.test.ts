import { describe, expect, it } from 'vitest';
import { cssString, runningHeaderCss } from '@/lib/print/running-header';

describe('running header', () => {
  it('shows name and page counters on pages 2+ only', () => {
    const css = runningHeaderCss('Sarah Chen');
    expect(css).toContain('@top-right');
    expect(css).toContain('counter(page) " / " counter(pages)');
    expect(css).toMatch(/@page :first \{\s*@top-right \{ content: none; \}/);
    expect(css).toContain('"Sarah Chen \\b7  "');
  });

  it('falls back to page numbers when there is no name', () => {
    const css = runningHeaderCss('   ');
    expect(css).toContain('content: counter(page) " / " counter(pages);');
  });

  it('escapes everything that could break out of the CSS string or the style tag', () => {
    const hostile = 'Ann"}</style><script>x</script>\\';
    const out = cssString(hostile);
    expect(out.slice(1, -1)).toMatch(/^[A-Za-z0-9 \\]*$/);
    expect(out).not.toContain('<');
    expect(out).not.toContain('}');
    expect(runningHeaderCss(hostile)).not.toContain('</style>');
  });

  it('keeps non-Latin names (escaped, not dropped)', () => {
    expect(cssString('陈')).toBe('"\\9648 "');
  });
});
