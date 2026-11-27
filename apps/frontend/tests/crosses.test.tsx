import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Crosses } from '@/components/ui/crosses';
import { EmptyState } from '@/components/ui/empty-state';
import { PageFrame } from '@/components/ui/page-frame';

/** The cross field: the drawing surface a sheet stands on, never under unbacked text. */
describe('Crosses', () => {
  it('is decorative, static, not printed, and draws in currentColor at a 32px module', () => {
    const { container } = render(<Crosses />);
    const svg = container.querySelector('svg') as SVGElement;
    const pattern = container.querySelector('pattern') as SVGElement;

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('print:hidden', 'pointer-events-none');
    expect(pattern).toHaveAttribute('width', '32');
    expect(container.querySelector('path')).toHaveAttribute('stroke', 'currentColor');
    // Arms of 7px about the module centre, strokes on whole pixels.
    expect(container.querySelector('path')).toHaveAttribute('d', 'M13 16.5h7M16.5 13v7');
  });

  it('takes another module and gives each field its own pattern id', () => {
    const { container } = render(
      <>
        <Crosses pitch={48} />
        <Crosses />
      </>
    );
    const [a, b] = Array.from(container.querySelectorAll('pattern'));
    expect(a).toHaveAttribute('width', '48');
    expect(a.id).not.toBe(b.id);
  });
});

describe('PageFrame ground', () => {
  const ground = (container: HTMLElement) =>
    (container.firstChild as HTMLElement).querySelector(':scope > svg');

  it('has no ground unless asked', () => {
    const { container } = render(<PageFrame>content</PageFrame>);
    expect(ground(container)).toBeNull();
  });

  it('shows the field from md behind a card, and only from 2xl behind a wide frame', () => {
    const { container, unmount } = render(<PageFrame ground="crosses">content</PageFrame>);
    expect(ground(container)).toHaveClass('hidden', 'md:block', '-z-10', 'text-steel');
    unmount();

    const wide = render(<PageFrame ground="crosses-wide">content</PageFrame>);
    expect(ground(wide.container)).toHaveClass('hidden', '2xl:block');
    expect(ground(wide.container)).not.toHaveClass('md:block');
    // A wide frame opens the module to 48px; the card keeps the owner's 32px.
    expect(wide.container.querySelector('pattern')).toHaveAttribute('width', '48');
  });

  it('offers a portrait card width for one focused task', () => {
    render(<PageFrame width="card">content</PageFrame>);
    expect(screen.getByText('content')).toHaveClass('max-w-[42rem]');
  });
});

describe('EmptyState field', () => {
  it('sets the message on a canvas plate over the crosses', () => {
    const { container } = render(
      <EmptyState variant="field" title="No jobs yet" description="Paste a job description." />
    );
    const plate = screen.getByText('No jobs yet').parentElement as HTMLElement;
    expect(plate).toHaveClass('bg-canvas', 'border-ink');
    expect(container.querySelector('svg')).toHaveClass('-z-10');
  });
});
