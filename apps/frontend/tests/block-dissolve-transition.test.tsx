import { act, fireEvent, render, screen } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockDissolveProvider } from '@/components/effects/block-dissolve-provider';
import Hero from '@/components/home/hero';
import { EffectsProvider } from '@/lib/context/effects-context';
import { useBlockDissolveNavigate } from '@/lib/effects/use-block-dissolve-navigate';

const push = vi.fn();
const prefetch = vi.fn();
let pathname = '/';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, prefetch }),
  usePathname: () => pathname,
}));

// The lazy boundary is not under test here: load the real overlay synchronously.
vi.mock('next/dynamic', async () => {
  const { BlockDissolve } = await import('@/components/effects/block-dissolve');
  return { default: () => BlockDissolve };
});
vi.mock('@/components/effects/background-effect', () => ({ BackgroundEffect: () => null }));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

// No canvas in jsdom. The overlay's own drawing is covered in block-dissolve-overlay.test.tsx;
// here the frames never run and only the sequence (timers) is under test.
const ctx = { fillStyle: '', clearRect: vi.fn(), fillRect: vi.fn() };

function Cta({ target }: { target?: string }) {
  const dissolve = useBlockDissolveNavigate();
  return (
    <Link
      href="/dashboard"
      target={target}
      onClick={dissolve.onClick}
      onMouseEnter={dissolve.prepare}
      onFocus={dissolve.prepare}
    >
      Launch
    </Link>
  );
}

function renderCta(props: { target?: string } = {}) {
  const ui = (path: string) => {
    pathname = path;
    return (
      <EffectsProvider>
        <BlockDissolveProvider>
          <Cta {...props} />
        </BlockDissolveProvider>
      </EffectsProvider>
    );
  };
  const view = render(ui('/'));
  return {
    ...view,
    // The router commits the new route: same tree, new pathname.
    navigateTo: (path: string) => view.rerender(ui(path)),
  };
}

/**
 * Click, and report whether the app took the click over (called preventDefault) before the browser
 * would follow the link. The listener then cancels the click itself, as jsdom cannot navigate.
 */
function click(el: Element, init?: MouseEventInit): boolean {
  let takenOver = false;
  const spy = (e: Event) => {
    takenOver = e.defaultPrevented;
    e.preventDefault();
  };
  document.addEventListener('click', spy, { once: true });
  fireEvent.click(el, init);
  document.removeEventListener('click', spy);
  return takenOver;
}

const overlay = () => document.querySelector('canvas');
const phase = () => overlay()?.getAttribute('data-phase');
const link = () => screen.getByRole('link', { name: 'Launch' });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  pathname = '/';
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.mocked(useReducedMotion).mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 1000,
    height: 600,
  } as DOMRect);
  vi.spyOn(performance, 'now').mockReturnValue(5000);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('click: the effect is on', () => {
  it('takes over a plain left click, navigates at once and mounts the overlay', () => {
    renderCta();
    expect(overlay()).toBeNull();

    const takenOver = click(link());

    expect(takenOver).toBe(true); // preventDefault was called: Link does not navigate twice
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard'); // before any timer has run
    expect(phase()).toBe('cover');
    expect(overlay()).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives Enter on the link the same effect (a keyboard click is a click with button 0)', () => {
    renderCta();
    link().focus();
    // The browser turns Enter on a focused anchor into a click with no pointer button.
    click(link(), { detail: 0, button: 0 });
    expect(push).toHaveBeenCalledWith('/dashboard');
    expect(phase()).toBe('cover');
  });

  it('prefetches the dashboard on hover and on focus', () => {
    renderCta();
    fireEvent.mouseEnter(link());
    expect(prefetch).toHaveBeenCalledWith('/dashboard');
    prefetch.mockClear();
    fireEvent.focus(link());
    expect(prefetch).toHaveBeenCalledWith('/dashboard');
  });

  it('ignores a second click while a transition is running', () => {
    renderCta();
    click(link());
    const second = click(link());
    expect(second).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe('click: the effect is skipped and the link behaves normally', () => {
  function expectDefaultNavigation(takenOver: boolean) {
    expect(takenOver).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
  }

  it('when effects are off', () => {
    localStorage.setItem('resume_matcher_effects', 'false');
    renderCta();
    expectDefaultNavigation(click(link()));
  });

  it('for reduced motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    renderCta();
    expectDefaultNavigation(click(link()));
    fireEvent.mouseEnter(link());
    expect(prefetch).not.toHaveBeenCalled();
  });

  it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'])('with %s held', (key) => {
    renderCta();
    expectDefaultNavigation(click(link(), { [key]: true }));
  });

  it('for a middle or right button', () => {
    renderCta();
    expectDefaultNavigation(click(link(), { button: 1 }));
    expectDefaultNavigation(click(link(), { button: 2 }));
  });

  it('when the link opens in a new tab', () => {
    renderCta({ target: '_blank' });
    expectDefaultNavigation(click(link()));
  });

  it('with no provider above it (print routes, isolated tests)', () => {
    render(
      <EffectsProvider>
        <Cta />
      </EffectsProvider>
    );
    expectDefaultNavigation(click(link()));
    fireEvent.mouseEnter(link());
    expect(prefetch).not.toHaveBeenCalled();
  });
});

describe('sequence', () => {
  it('covers for 250 ms, holds while the route is not /dashboard, reveals once it is, then unmounts', () => {
    const { navigateTo } = renderCta();
    click(link());
    expect(phase()).toBe('cover');

    advance(249);
    expect(phase()).toBe('cover');
    advance(1);
    expect(phase()).toBe('covered'); // covered, but the route has not arrived

    advance(600);
    expect(phase()).toBe('covered'); // a slow route never starts the reveal by itself

    navigateTo('/dashboard');
    expect(phase()).toBe('reveal');
    advance(249);
    expect(overlay()).not.toBeNull();
    advance(1);
    expect(overlay()).toBeNull(); // and it is out of the DOM: the page is interactive
  });

  it('waits for the cover to finish even when the route is already there', () => {
    const { navigateTo } = renderCta();
    click(link());
    advance(100);
    navigateTo('/dashboard');
    expect(phase()).toBe('cover'); // the cover plays out in full first
    advance(150);
    expect(phase()).toBe('reveal');
    advance(250);
    expect(overlay()).toBeNull();
  });

  it("runs the overlay on the provider's clock: the cover starts clear, the reveal starts covered", () => {
    const { navigateTo } = renderCta();
    click(link());
    expect(ctx.fillRect).not.toHaveBeenCalled(); // 1000 x 600 is 13 x 8 blocks; none yet

    advance(250);
    expect(phase()).toBe('covered');
    expect(ctx.fillRect).toHaveBeenCalledTimes(13 * 8);

    ctx.fillRect.mockClear();
    navigateTo('/dashboard');
    expect(phase()).toBe('reveal');
    expect(ctx.fillRect).toHaveBeenCalledTimes(13 * 8); // the reveal begins with every block
  });

  it('does not restart a reveal that is already running when the safety timeout fires', () => {
    const { navigateTo } = renderCta();
    click(link());
    advance(1400);
    navigateTo('/dashboard'); // a late route: the reveal begins
    expect(phase()).toBe('reveal');

    ctx.fillRect.mockClear();
    vi.mocked(performance.now).mockReturnValue(5100); // time passes
    advance(100); // the safety timeout fires at 1500
    expect(phase()).toBe('reveal');
    expect(ctx.fillRect).not.toHaveBeenCalled(); // the phase clock was not reset
  });

  it('does not reveal for another route', () => {
    const { navigateTo } = renderCta();
    click(link());
    advance(300);
    navigateTo('/settings');
    expect(phase()).toBe('covered');
  });

  it('always reveals and unmounts after the safety timeout, even if the route never changes', () => {
    renderCta();
    click(link());
    advance(1499);
    expect(phase()).toBe('covered');
    advance(1);
    expect(phase()).toBe('reveal');
    advance(250);
    expect(overlay()).toBeNull();
  });

  it('unmounts the overlay even if it never draws a frame (the reveal ends on a timer)', () => {
    // rAF is stubbed to never fire, as in a hidden tab: the sequence must not depend on it.
    renderCta();
    click(link());
    advance(1500);
    advance(250);
    expect(overlay()).toBeNull();
  });

  it('is ready for another run afterwards', () => {
    const { navigateTo } = renderCta();
    click(link());
    advance(300);
    navigateTo('/dashboard');
    advance(250);
    expect(overlay()).toBeNull();

    navigateTo('/');
    click(link());
    expect(push).toHaveBeenCalledTimes(2);
    expect(phase()).toBe('cover');
  });

  it('clears its timers when the tree unmounts mid-transition', () => {
    const { unmount } = renderCta();
    click(link());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Hero', () => {
  function renderHero() {
    return render(
      <EffectsProvider>
        <BlockDissolveProvider>
          <Hero />
        </BlockDissolveProvider>
      </EffectsProvider>
    );
  }

  it('runs the effect from the Launch CTA only', () => {
    renderHero();
    const [github, docs, launch] = screen.getAllByRole('link');
    expect(launch).toHaveAttribute('href', '/dashboard');

    expect(click(github)).toBe(false);
    expect(click(docs)).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();

    expect(click(launch)).toBe(true);
    expect(push).toHaveBeenCalledWith('/dashboard');
    expect(phase()).toBe('cover');
  });

  it('still navigates normally when effects are off', () => {
    localStorage.setItem('resume_matcher_effects', 'false');
    renderHero();
    const launch = screen.getByRole('link', { name: 'home.launchApp' });
    expect(click(launch)).toBe(false);
    expect(overlay()).toBeNull();
  });
});
