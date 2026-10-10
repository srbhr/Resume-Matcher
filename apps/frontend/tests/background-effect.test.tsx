import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundEffect } from '@/components/effects/background-effect';
import Hero from '@/components/home/hero';
import { PageFrame } from '@/components/ui/page-frame';
import { EffectsProvider } from '@/lib/context/effects-context';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

// The real field needs canvas and observers; here only the wiring matters, so stand in for it and
// make the lazy boundary synchronous.
vi.mock('next/dynamic', () => ({
  default: () =>
    function Field({ className }: { className?: string }) {
      return <canvas data-testid="field" className={className} />;
    },
}));

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('BackgroundEffect', () => {
  it('renders the field behind the page, fixed to the viewport, when effects are on', () => {
    render(
      <EffectsProvider>
        <BackgroundEffect />
      </EffectsProvider>
    );
    // Fixed + inset-0: one screen of dots however long the page is. Not `absolute`, which would
    // fill the whole (possibly very tall) parent.
    const field = screen.getByTestId('field');
    expect(field).toHaveClass('fixed', 'inset-0', '-z-10', 'h-full', 'w-full', 'text-steel');
    expect(field).not.toHaveClass('absolute');
  });

  it('renders no canvas at all when the stored choice is off', () => {
    localStorage.setItem('resume_matcher_effects', 'false');
    const { container } = render(
      <EffectsProvider>
        <BackgroundEffect />
      </EffectsProvider>
    );
    expect(screen.queryByTestId('field')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('renders no canvas outside a provider (print routes, isolated tests)', () => {
    const { container } = render(<BackgroundEffect />);
    expect(container.querySelector('canvas')).toBeNull();
  });
});

describe('PageFrame with the effect', () => {
  it('stacks the effect behind an opaque frame, on a plain Canvas base', () => {
    const { container } = render(
      <EffectsProvider>
        <PageFrame>
          <p>content</p>
        </PageFrame>
      </EffectsProvider>
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer).toHaveClass('relative', 'isolate', 'bg-canvas');
    expect(outer).not.toHaveClass('bg-blueprint');
    const field = screen.getByTestId('field');
    expect(field.parentElement).toBe(outer);
    expect(screen.getByText('content').parentElement).toHaveClass('bg-canvas', 'border-ink');
  });

  it('leaves plain Canvas when effects are off', () => {
    localStorage.setItem('resume_matcher_effects', 'false');
    const { container } = render(
      <EffectsProvider>
        <PageFrame>
          <p>content</p>
        </PageFrame>
      </EffectsProvider>
    );
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.firstChild).toHaveClass('bg-canvas');
  });
});

describe('Hero with the effect', () => {
  it('puts the effect behind the framed hero, and leaves plain Canvas when off', () => {
    const { container, unmount } = render(
      <EffectsProvider>
        <Hero />
      </EffectsProvider>
    );
    expect(screen.getByTestId('field').parentElement).toBe(container.firstChild);
    expect(container.firstChild).toHaveClass('relative', 'isolate', 'bg-canvas');
    unmount();

    localStorage.setItem('resume_matcher_effects', 'false');
    const off = render(
      <EffectsProvider>
        <Hero />
      </EffectsProvider>
    );
    expect(off.container.querySelector('canvas')).toBeNull();
    expect(off.container.firstChild).toHaveClass('bg-canvas');
  });
});
