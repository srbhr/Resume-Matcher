import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutreachPreview } from '@/components/builder/outreach-preview';
import { ProjectsForm } from '@/components/builder/forms/projects-form';
import { BrandIcon, type BrandIconName } from '@/components/ui/brand-icon';

/**
 * The outreach preview and the project form show the official LinkedIn and GitHub marks
 * (BrandIcon), not the generic Phosphor glyphs. Phosphor draws on a 256 box, BrandIcon on a
 * 24 box, so comparing against a rendered BrandIcon pins the right artwork at the call site.
 */

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

// The rich-text editor is a lazy TipTap import and irrelevant to the label icons.
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({ value }: { value: string }) => <div data-testid="rte">{value}</div>,
}));

function artwork(svg: Element): string {
  return Array.from(svg.querySelectorAll('path'))
    .map((p) => p.getAttribute('d'))
    .join('|');
}

function markArtwork(name: BrandIconName): string {
  const { container, unmount } = render(<BrandIcon name={name} />);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error(`BrandIcon ${name} rendered no svg`);
  const d = artwork(svg);
  unmount();
  return d;
}

function iconNextTo(text: string): SVGElement {
  const svg = screen.getByText(text).parentElement?.querySelector('svg');
  if (!svg) throw new Error(`no icon beside "${text}"`);
  return svg;
}

describe('OutreachPreview channel marks', () => {
  it('shows the LinkedIn mark beside the LinkedIn label, decorative and 16px', () => {
    render(<OutreachPreview content="Hello" />);

    const svg = iconNextTo('outreach.preview.channels.linkedin');

    expect(artwork(svg)).toBe(markArtwork('linkedin'));
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('size-4', 'text-ink');
  });

  it('keeps the email glyph as the generic icon, not a brand mark', () => {
    render(<OutreachPreview content="Hello" />);

    const svg = iconNextTo('outreach.preview.channels.email');

    expect(svg).not.toHaveAttribute('viewBox', '0 0 24 24');
    expect(artwork(svg)).not.toBe(markArtwork('linkedin'));
  });
});

describe('ProjectsForm GitHub mark', () => {
  it('shows the GitHub mark in the GitHub field label, decorative and 16px', () => {
    const { container } = render(
      <ProjectsForm data={[{ id: 1, name: 'Hireo AI', description: [] }]} onChange={vi.fn()} />
    );

    const label = container.querySelector('label[for$="-github"]');
    const svg = label?.querySelector('svg');
    if (!svg) throw new Error('the GitHub label has no icon');

    expect(artwork(svg)).toBe(markArtwork('github'));
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('size-4', 'inline', 'mr-1');
  });

  it('leaves the website label on the generic globe', () => {
    const { container } = render(
      <ProjectsForm data={[{ id: 1, name: 'Hireo AI', description: [] }]} onChange={vi.fn()} />
    );

    const svg = container.querySelector('label[for$="-website"] svg');
    expect(svg).not.toBeNull();
    expect(svg).not.toHaveAttribute('viewBox', '0 0 24 24');
  });
});
