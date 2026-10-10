import { act, fireEvent, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockDissolveProvider } from '@/components/effects/block-dissolve-provider';
import { EffectsProvider } from '@/lib/context/effects-context';
import { useBlockDissolveNavigate } from '@/lib/effects/use-block-dissolve-navigate';

const push = vi.fn();
let pathname = '/';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, prefetch: vi.fn() }),
  usePathname: () => pathname,
}));
// A stale chunk after a deploy: the overlay can never be loaded.
vi.mock('@/components/effects/block-dissolve', () => {
  throw new Error('chunk failed to load');
});

function Cta() {
  const dissolve = useBlockDissolveNavigate();
  return (
    <Link href="/dashboard" onClick={dissolve.onClick}>
      Launch
    </Link>
  );
}

const ui = (path: string) => {
  pathname = path;
  return (
    <EffectsProvider>
      <BlockDissolveProvider>
        <Cta />
      </BlockDissolveProvider>
    </EffectsProvider>
  );
};

beforeEach(() => {
  pathname = '/';
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('overlay chunk fails to load', () => {
  it('skips the effect, never the navigation, and leaves nothing behind', async () => {
    const { rerender } = render(ui('/'));
    const spy = (e: Event) => e.preventDefault(); // jsdom cannot follow the link
    document.addEventListener('click', spy, { once: true });
    fireEvent.click(screen.getByRole('link', { name: 'Launch' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector('canvas')).toBeNull(); // nothing to draw

    act(() => vi.advanceTimersByTime(200));
    expect(push).toHaveBeenCalledWith('/dashboard'); // the cover timer still pushes

    rerender(ui('/dashboard'));
    act(() => vi.advanceTimersByTime(250));
    expect(vi.getTimerCount()).toBe(0); // the sequence ran to idle
    expect(document.querySelector('canvas')).toBeNull();
  });
});
