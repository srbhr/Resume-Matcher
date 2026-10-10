import { act, render } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DitherField } from '@/components/effects/dither-field';
import { PageFrame } from '@/components/ui/page-frame';
import { EffectsProvider } from '@/lib/context/effects-context';

// The lazy boundary around the field is not under test here: load the real field synchronously.
vi.mock('next/dynamic', async () => {
  const { DitherField: Field } = await import('@/components/effects/dither-field');
  return { default: () => Field };
});

// jsdom has no canvas, no observers and no animation frames: stand in for all of them, and drive
// the loop by hand so frame counts are exact.
const ctx = {
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  fill: vi.fn(),
  fillStyle: '',
  globalAlpha: 1,
};
let intersect: ((isIntersecting: boolean) => void) | undefined;
let resizeObserved: () => void;
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
const requestFrame = vi.fn((cb: FrameRequestCallback) => {
  frames.set(nextFrame, cb);
  return nextFrame++;
});
const cancelFrame = vi.fn((id: number) => {
  frames.delete(id);
});
const disconnects = vi.fn();

/** Run the queued frame callback at `now` ms, the way the browser would. */
function runFrame(now: number) {
  const [id, cb] = [...frames.entries()][0];
  frames.delete(id);
  act(() => cb(now));
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  intersect = undefined;
  frames.clear();
  nextFrame = 1;
  vi.mocked(useReducedMotion).mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 120,
    height: 60,
  } as DOMRect);
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = (isIntersecting) => act(() => cb([{ isIntersecting }]));
      }
      observe() {}
      disconnect = disconnects;
    }
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resizeObserved = () => act(() => cb());
      }
      observe() {}
      disconnect = disconnects;
    }
  );
});

afterEach(() => {
  setHidden(false);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DitherField', () => {
  it('is an inert, decorative canvas that takes its classes from the call site', () => {
    const { container } = render(<DitherField className="text-steel absolute inset-0" />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas).toHaveClass('pointer-events-none', 'text-steel', 'absolute', 'inset-0');
  });

  it('draws the first frame as one path, in device pixels, at the dot alpha', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const { container } = render(<DitherField />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(120);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.rect.mock.calls.length).toBeGreaterThan(0);
    expect(ctx.globalAlpha).toBeGreaterThan(0);
    expect(ctx.globalAlpha).toBeLessThan(1);
    // 6px cell at DPR 2, half-cell dots
    const [, , w, h] = ctx.rect.mock.calls[0];
    expect([w, h]).toEqual([6, 6]);
  });

  it('caps the device pixel ratio at 2', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { container } = render(<DitherField />);
    expect(container.querySelector('canvas')!.width).toBe(240);
  });

  it('fades in over the surface duration once the first frame is drawn', () => {
    const { container } = render(<DitherField />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.getAttribute('style')).toContain('transition: opacity 200ms');
    expect(canvas.style.opacity).toBe('1');
  });

  it('redraws when the box resizes', () => {
    render(<DitherField />);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    resizeObserved();
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it('does not loop until it is on screen, then draws at 12 fps and keeps asking for frames', () => {
    render(<DitherField />);
    expect(requestFrame).not.toHaveBeenCalled();

    intersect!(true);
    expect(requestFrame).toHaveBeenCalledTimes(1);

    runFrame(1000); // first frame of a run draws at once
    expect(ctx.fill).toHaveBeenCalledTimes(2);
    runFrame(1040); // 40ms later: under the 83ms interval, no draw
    expect(ctx.fill).toHaveBeenCalledTimes(2);
    runFrame(1090); // 90ms after the last draw
    expect(ctx.fill).toHaveBeenCalledTimes(3);
    expect(requestFrame).toHaveBeenCalledTimes(4);
    expect(frames.size).toBe(1);
  });

  it('stops asking for frames when it scrolls off screen, and resumes when it returns', () => {
    render(<DitherField />);
    intersect!(true);
    runFrame(1000);
    intersect!(false);
    expect(frames.size).toBe(0);
    intersect!(true);
    expect(frames.size).toBe(1);
  });

  it('draws one still frame and never schedules a frame under reduced motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    render(<DitherField />);
    expect(ctx.fill).toHaveBeenCalledTimes(1);

    // Even if something announces the canvas is visible, there is no loop to start.
    intersect?.(true);
    setHidden(false);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(ctx.fill).toHaveBeenCalledTimes(1);

    // A resize still repaints the one frame.
    resizeObserved();
    expect(ctx.fill).toHaveBeenCalledTimes(2);
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('stops the loop when the tab is hidden, and restarts it when the tab returns', () => {
    render(<DitherField />);
    intersect!(true);
    runFrame(1000);
    expect(frames.size).toBe(1);

    setHidden(true);
    expect(frames.size).toBe(0);
    const requested = requestFrame.mock.calls.length;
    const drawn = ctx.fill.mock.calls.length;

    expect(requestFrame).toHaveBeenCalledTimes(requested);
    expect(ctx.fill).toHaveBeenCalledTimes(drawn);

    setHidden(false);
    expect(frames.size).toBe(1);
  });

  it('does not draw from a frame that fires after the tab was hidden', () => {
    render(<DitherField />);
    intersect!(true);
    const drawn = ctx.fill.mock.calls.length;
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    runFrame(5000);
    expect(ctx.fill).toHaveBeenCalledTimes(drawn);
    expect(frames.size).toBe(0);
  });

  it('cancels its frame and disconnects its observers on unmount', () => {
    const { unmount } = render(<DitherField />);
    intersect!(true);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(disconnects).toHaveBeenCalledTimes(2);
  });

  it('renders an empty canvas when 2D drawing is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = render(<DitherField />);
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(requestFrame).not.toHaveBeenCalled();
  });
});

describe('DitherField in the page background', () => {
  // jsdom has no layout. Model the one CSS fact that matters here: a `fixed` box is the viewport,
  // any other box fills its (tall) page. The model is checked against a real browser in the report.
  const PAGE_HEIGHT = 6000;
  function setViewport(width: number, height: number) {
    vi.stubGlobal('innerWidth', width);
    vi.stubGlobal('innerHeight', height);
  }
  beforeEach(() => {
    localStorage.clear();
    setViewport(1440, 900);
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: PAGE_HEIGHT,
      configurable: true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLCanvasElement
    ) {
      const height = this.classList.contains('fixed') ? window.innerHeight : PAGE_HEIGHT;
      return { width: window.innerWidth, height } as DOMRect;
    });
  });
  afterEach(() => {
    delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
  });

  function renderPage() {
    return render(
      <EffectsProvider>
        <PageFrame>
          <p>a very long page</p>
        </PageFrame>
      </EffectsProvider>
    );
  }

  it('backs the canvas with one screen, not the page height', () => {
    const { container } = renderPage();
    const canvas = container.querySelector('canvas')!;
    expect(canvas).toHaveClass('fixed', 'inset-0');
    expect([canvas.width, canvas.height]).toEqual([1440, 900]);
  });

  it('keeps one screen at DPR 2, so a long page never nears the canvas size limit', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const { container } = renderPage();
    const canvas = container.querySelector('canvas')!;
    expect([canvas.width, canvas.height]).toEqual([2880, 1800]);
    expect(canvas.height).toBeLessThan(PAGE_HEIGHT);
  });

  it('follows the window when it is resized', () => {
    const { container } = renderPage();
    const canvas = container.querySelector('canvas')!;
    setViewport(800, 600);
    resizeObserved();
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });
});
