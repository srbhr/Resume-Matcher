import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandIcon, hasBrandIcon, type BrandIconName } from '@/components/ui/brand-icon';

const NAMES: BrandIconName[] = [
  'openai',
  'anthropic',
  'azure_foundry',
  'gemini',
  'openrouter',
  'deepseek',
  'groq',
  'ollama',
  'linkedin',
  'github',
];

// Anything that would carry a colour or a paint server instead of currentColor.
const NOT_MONOCHROME =
  /#|url\(|<(?:defs|style|linearGradient|radialGradient|mask|filter|clipPath)\b/i;

function renderMark(name: BrandIconName, props: { className?: string; title?: string } = {}) {
  const { container } = render(<BrandIcon name={name} {...props} />);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error(`BrandIcon ${name} rendered no svg`);
  return svg;
}

describe('BrandIcon', () => {
  it.each(NAMES)('%s is a single-colour svg: every shape paints with currentColor', (name) => {
    const svg = renderMark(name);

    const shapes = Array.from(svg.children);
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect(shape.tagName).toBe('path');
      expect(shape).toHaveAttribute('fill', 'currentColor');
      expect(shape.getAttribute('d')?.length).toBeGreaterThan(50);
    }
    expect(svg.outerHTML).not.toMatch(NOT_MONOCHROME);

    // Tight square box: the symbol is scaled to fill it, so the viewBox is the only sizing data.
    const [x, y, w, h] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect([x, y]).toEqual([0, 0]);
    expect(w).toBeGreaterThan(0);
    expect(h).toBe(w);
  });

  it('gives every name its own artwork', () => {
    const artwork = NAMES.map((name) =>
      Array.from(renderMark(name).children)
        .map((p) => p.getAttribute('d'))
        .join('|')
    );
    expect(new Set(artwork).size).toBe(NAMES.length);
  });

  it('keeps the LinkedIn "in" a cut-out of the square (even-odd fill, not a white overlay)', () => {
    const svg = renderMark('linkedin');
    for (const shape of Array.from(svg.children)) {
      expect(shape).toHaveAttribute('fill-rule', 'evenodd');
    }
  });

  it('is hidden from assistive tech by default', () => {
    const svg = renderMark('openai');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
    expect(svg.querySelector('title')).toBeNull();
  });

  it('with a title becomes a named image', () => {
    renderMark('anthropic', { title: 'Anthropic' });
    const img = screen.getByRole('img', { name: 'Anthropic' });
    expect(img.tagName.toLowerCase()).toBe('svg');
    expect(img).not.toHaveAttribute('aria-hidden');
    expect(img.querySelector('title')).toHaveTextContent('Anthropic');
  });

  it('passes className through and scales with text when unsized', () => {
    const svg = renderMark('github', { className: 'size-4 shrink-0' });
    expect(svg).toHaveClass('size-4', 'shrink-0');
    expect(svg).toHaveAttribute('width', '1em');
    expect(svg).toHaveAttribute('height', '1em');
  });

  it('renders nothing for an unknown name', () => {
    for (const name of ['nope', 'openai_compatible', 'constructor', '__proto__']) {
      const { container, unmount } = render(<BrandIcon name={name as BrandIconName} />);
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });
});

describe('hasBrandIcon', () => {
  it.each(NAMES)('knows %s', (name) => {
    expect(hasBrandIcon(name)).toBe(true);
  });

  it('is false for providers without a brand file and for inherited keys', () => {
    for (const name of ['openai_compatible', 'nope', '', 'constructor', 'toString']) {
      expect(hasBrandIcon(name)).toBe(false);
    }
  });
});
