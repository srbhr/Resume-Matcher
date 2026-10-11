import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockDissolveProvider } from '@/components/effects/block-dissolve-provider';
import Hero from '@/components/home/hero';
import { EffectsProvider } from '@/lib/context/effects-context';
import {
  BlockDissolveContext,
  useBlockDissolveNavigate,
} from '@/lib/effects/use-block-dissolve-navigate';

const push = vi.fn();
const prefetch = vi.fn();
let pathname = '/';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, prefetch }),
  usePathname: () => pathname,
}));

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

/**
 * The overlay chunk is imported by hand (the first import is async, as in the browser). Let that
 * import land and the provider take it, inside act.
 */
const settle = () =>
  act(async () => {
    await import('@/components/effects/block-dissolve');
    await Promise.resolve();
  });
/** A click, then the overlay chunk arriving: what a click on a page whose chunk is not warm does. */
async function tap(el: Element, init?: MouseEventInit): Promise<boolean> {
  const takenOver = click(el, init);
  await settle();
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
  it('takes over a plain left click, covers Home first and mounts the overlay', async () => {
    renderCta();
    expect(overlay()).toBeNull();

    const takenOver = await tap(link());

    expect(takenOver).toBe(true); // preventDefault was called: Link does not navigate twice
    expect(push).not.toHaveBeenCalled(); // Home is covered before the route changes
    expect(phase()).toBe('cover');
    expect(overlay()).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives Enter on the link the same effect (a keyboard click is a click with button 0)', async () => {
    renderCta();
    link().focus();
    // The browser turns Enter on a focused anchor into a click with no pointer button.
    await tap(link(), { detail: 0, button: 0 });
    expect(phase()).toBe('cover');
    expect(push).not.toHaveBeenCalled();
    advance(200);
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('with the chunk still on its way, the sequence does not wait for it: the overlay joins on arrival', async () => {
    renderCta();
    click(link()); // no settle: the overlay chunk has not landed yet
    expect(overlay()).toBeNull();
    advance(200);
    expect(push).toHaveBeenCalledWith('/dashboard'); // the navigation is on time all the same

    await settle();
    expect(phase()).toBe('covered');
  });

  it('prefetches the dashboard on hover and on focus', () => {
    renderCta();
    fireEvent.mouseEnter(link());
    expect(prefetch).toHaveBeenCalledWith('/dashboard');
    prefetch.mockClear();
    fireEvent.focus(link());
    expect(prefetch).toHaveBeenCalledWith('/dashboard');
  });

  it('ignores a second click while a transition is running', async () => {
    renderCta();
    await tap(link());
    const second = await tap(link());
    expect(second).toBe(true);
    advance(200);
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe('click: the effect is skipped and the link behaves normally', () => {
  // A plain, immediate navigation: the app does not take the click over, so the browser follows
  // the link at once (no cover, no delay, no push of our own).
  function expectDefaultNavigation(takenOver: boolean) {
    expect(takenOver).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
    advance(5000);
    expect(push).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
  }

  it('when effects are off', async () => {
    localStorage.setItem('resume_matcher_effects', 'false');
    renderCta();
    expectDefaultNavigation(await tap(link()));
  });

  it('for reduced motion', async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    renderCta();
    expectDefaultNavigation(await tap(link()));
    fireEvent.mouseEnter(link());
    expect(prefetch).not.toHaveBeenCalled();
  });

  it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'])('with %s held', async (key) => {
    renderCta();
    expectDefaultNavigation(await tap(link(), { [key]: true }));
  });

  it('for a middle or right button', async () => {
    renderCta();
    expectDefaultNavigation(await tap(link(), { button: 1 }));
    expectDefaultNavigation(await tap(link(), { button: 2 }));
  });

  it('when the link opens in a new tab', async () => {
    renderCta({ target: '_blank' });
    expectDefaultNavigation(await tap(link()));
  });

  it('with no provider above it (print routes, isolated tests)', async () => {
    render(
      <EffectsProvider>
        <Cta />
      </EffectsProvider>
    );
    expectDefaultNavigation(await tap(link()));
    fireEvent.mouseEnter(link());
    expect(prefetch).not.toHaveBeenCalled();
  });
});

describe('sequence', () => {
  it('covers Home for 200 ms, pushes, holds until the route is /dashboard, reveals for 250 ms, then unmounts', async () => {
    const { navigateTo } = renderCta();
    await tap(link());
    expect(phase()).toBe('cover');

    advance(199);
    expect(phase()).toBe('cover');
    advance(1);
    expect(phase()).toBe('covered'); // covered, and the route has been asked for
    expect(push).toHaveBeenCalledWith('/dashboard');

    advance(600);
    expect(phase()).toBe('covered'); // a slow route never starts the reveal by itself

    navigateTo('/dashboard');
    expect(phase()).toBe('reveal');
    advance(249);
    expect(overlay()).not.toBeNull();
    advance(1);
    expect(overlay()).toBeNull(); // and it is out of the DOM: the page is interactive
  });

  it('pushes only after the cover completes, and only once', async () => {
    renderCta();
    await tap(link());
    expect(push).not.toHaveBeenCalled();
    advance(100);
    expect(push).not.toHaveBeenCalled();
    advance(99);
    expect(push).not.toHaveBeenCalled();
    advance(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard');
    advance(2000);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('starts the reveal only after the pathname changes', async () => {
    const { navigateTo } = renderCta();
    await tap(link());
    advance(200);
    expect(phase()).toBe('covered');

    advance(1000);
    expect(phase()).toBe('covered'); // pushed, but the route has not committed yet

    navigateTo('/dashboard');
    expect(phase()).toBe('reveal');
  });

  it('never reveals during the cover, even if the route is already /dashboard', async () => {
    const { navigateTo } = renderCta();
    await tap(link());
    advance(100);
    navigateTo('/dashboard'); // someone else got there first: the cover still plays out in full
    expect(phase()).toBe('cover');

    advance(100);
    expect(push).toHaveBeenCalledTimes(1);
    expect(phase()).toBe('reveal'); // covered at 200, and the route is there: reveal at once
  });

  it("runs the overlay on the provider's clock: the cover starts clear, the reveal starts covered", async () => {
    const { navigateTo } = renderCta();
    await tap(link());
    expect(ctx.fillRect).not.toHaveBeenCalled(); // 1000 x 600 is 13 x 8 blocks; none yet

    advance(200);
    expect(phase()).toBe('covered');
    expect(ctx.fillRect).toHaveBeenCalledTimes(13 * 8);

    ctx.fillRect.mockClear();
    navigateTo('/dashboard');
    expect(phase()).toBe('reveal');
    expect(ctx.fillRect).toHaveBeenCalledTimes(13 * 8); // the reveal begins with every block
  });

  it('does not restart a reveal that is already running when the safety timeout would have fired', async () => {
    const { navigateTo } = renderCta();
    await tap(link());
    advance(200 + 1400); // the push was at 200: the safety timeout is due at 1700
    navigateTo('/dashboard'); // a late route: the reveal begins
    expect(phase()).toBe('reveal');

    ctx.fillRect.mockClear();
    vi.mocked(performance.now).mockReturnValue(5100); // time passes
    advance(100); // 1700
    expect(phase()).toBe('reveal');
    expect(ctx.fillRect).not.toHaveBeenCalled(); // the phase clock was not reset
  });

  it('does not reveal for another route', async () => {
    const { navigateTo } = renderCta();
    await tap(link());
    advance(300);
    navigateTo('/settings');
    expect(phase()).toBe('covered');
  });

  it('measures the safety timeout from the push, and still always reveals and unmounts', async () => {
    renderCta();
    await tap(link());
    advance(200); // the push
    advance(1499);
    expect(phase()).toBe('covered');
    advance(1);
    expect(phase()).toBe('reveal');
    advance(249);
    expect(overlay()).not.toBeNull();
    advance(1);
    expect(overlay()).toBeNull();
  });

  it('does not start the safety clock at the click', async () => {
    renderCta();
    await tap(link());
    advance(200); // the push
    advance(1300); // 1500 after the click: a clock from the click would have fired by now
    expect(phase()).toBe('covered');
    advance(199);
    expect(phase()).toBe('covered');
    advance(1);
    expect(phase()).toBe('reveal');
  });

  it('unmounts the overlay even if it never draws a frame (every phase ends on a timer)', async () => {
    // rAF is stubbed to never fire, as in a hidden tab: the sequence must not depend on it.
    renderCta();
    await tap(link());
    advance(200);
    advance(1500);
    advance(250);
    expect(overlay()).toBeNull();
  });

  it('is ready for another run afterwards', async () => {
    const { navigateTo } = renderCta();
    await tap(link());
    advance(300);
    navigateTo('/dashboard');
    advance(250);
    expect(overlay()).toBeNull();

    navigateTo('/');
    await tap(link());
    expect(phase()).toBe('cover');
    advance(200);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('clears its timers when the tree unmounts mid-transition, and never pushes late', async () => {
    const { unmount } = renderCta();
    await tap(link());
    advance(100);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    advance(5000);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('idle preload', () => {
  const idle = vi.fn<(cb: () => void) => number>();
  const cancelIdle = vi.fn();

  beforeEach(() => {
    idle.mockReset().mockReturnValue(7);
    cancelIdle.mockReset();
    vi.stubGlobal('requestIdleCallback', idle);
    vi.stubGlobal('cancelIdleCallback', cancelIdle);
  });

  // Unmount while the idle stubs are still in place: the cleanup cancels through them.
  afterEach(cleanup);

  it('warms the route and the overlay once, on first idle, with no hover or focus', () => {
    renderCta();
    expect(idle).toHaveBeenCalledTimes(1);
    expect(prefetch).not.toHaveBeenCalled(); // not before the browser is idle

    act(() => idle.mock.calls[0][0]());
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith('/dashboard');
  });

  it('has the overlay in hand by the click, so the cover starts on the click itself', async () => {
    renderCta();
    act(() => idle.mock.calls[0][0]());
    await settle(); // the browser was idle: the chunk has landed

    click(link()); // and nothing to wait for after the click
    expect(phase()).toBe('cover');
  });

  it('is scheduled once, even though the provider re-renders as the phases run', async () => {
    const { navigateTo } = renderCta();
    act(() => idle.mock.calls[0][0]());
    await tap(link());
    advance(200);
    navigateTo('/dashboard');
    advance(250);
    expect(idle).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to a timer where requestIdleCallback does not exist', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    renderCta();
    expect(prefetch).not.toHaveBeenCalled();
    advance(200);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith('/dashboard');
    advance(5000);
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('is cancelled on unmount, so a late idle callback never runs', () => {
    const { unmount } = renderCta();
    unmount();
    expect(cancelIdle).toHaveBeenCalledWith(7);
  });

  it('calls the controls prepare exactly once, however often the controls change identity', () => {
    const prepareSpy = vi.fn();
    const ui = () => (
      <EffectsProvider>
        <BlockDissolveContext.Provider value={{ start: vi.fn(), prepare: prepareSpy }}>
          <Cta />
        </BlockDissolveContext.Provider>
      </EffectsProvider>
    );
    const { rerender } = render(ui());
    rerender(ui());
    rerender(ui());
    expect(idle).toHaveBeenCalledTimes(1);
    act(() => idle.mock.calls[0][0]());
    expect(prepareSpy).toHaveBeenCalledTimes(1);
  });

  it('warms nothing when effects are off (the pending idle callback is cancelled)', () => {
    localStorage.setItem('resume_matcher_effects', 'false');
    renderCta();
    expect(cancelIdle).toHaveBeenCalledWith(7);
    for (const [run] of idle.mock.calls) run(); // even a stale callback does nothing
    advance(5000);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('warms nothing for reduced motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    renderCta();
    advance(5000);
    expect(idle).not.toHaveBeenCalled();
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('warms nothing with no provider above the link', () => {
    render(
      <EffectsProvider>
        <Cta />
      </EffectsProvider>
    );
    advance(5000);
    expect(idle).not.toHaveBeenCalled();
    expect(prefetch).not.toHaveBeenCalled();
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

  it('runs the effect from the Launch CTA only', async () => {
    renderHero();
    const [github, docs, launch] = screen.getAllByRole('link');
    expect(launch).toHaveAttribute('href', '/dashboard');

    expect(await tap(github)).toBe(false);
    expect(await tap(docs)).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();

    expect(await tap(launch)).toBe(true);
    expect(push).not.toHaveBeenCalled(); // Home is covered first
    expect(phase()).toBe('cover');
    advance(200);
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('still navigates normally when effects are off', async () => {
    localStorage.setItem('resume_matcher_effects', 'false');
    renderHero();
    const launch = screen.getByRole('link', { name: 'home.launchApp' });
    expect(await tap(launch)).toBe(false);
    expect(overlay()).toBeNull();
  });
});
