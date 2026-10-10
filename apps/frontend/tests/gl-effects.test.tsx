import { StrictMode, type ReactElement } from 'react';
import { act, render } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PixelBeams } from '@/components/effects/pixel-beams';
import { RetroBitrate } from '@/components/effects/retro-bitrate';
import { EffectsProvider } from '@/lib/context/effects-context';
import { PIXEL_BEAMS_FRAGMENT } from '@/lib/effects/shaders/pixel-beams';
import { RETRO_BITRATE_FRAGMENT } from '@/lib/effects/shaders/retro-bitrate';
import { installFakeWebGl } from './fake-webgl';

// The 2D fallback needs its own canvas context; here only the wiring matters.
vi.mock('@/components/effects/dither-field', () => ({
  DitherField: ({ className }: { className?: string }) => (
    <canvas data-testid="dither-fallback" className={className} />
  ),
}));

const TOKENS: Record<string, string> = {
  '--sw-canvas': '#f0f0e8',
  '--sw-steel': '#696d75',
  '--sw-primary': '#1d4ed8',
  '--sw-ink': '#000000',
  '--sw-success': '#127e3b',
};

let fake: ReturnType<typeof installFakeWebGl>;

const on = (ui: ReactElement) => <EffectsProvider>{ui}</EffectsProvider>;

beforeEach(() => {
  localStorage.clear();
  fake = installFakeWebGl();
  vi.mocked(useReducedMotion).mockReturnValue(false);
  vi.stubGlobal('devicePixelRatio', 1);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (name: string) => TOKENS[name] ?? '',
  } as unknown as CSSStyleDeclaration);
});

afterEach(() => {
  fake.setHidden(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const EFFECTS = [
  { name: 'PixelBeams', Effect: PixelBeams, source: PIXEL_BEAMS_FRAGMENT, fps: 24 },
  { name: 'RetroBitrate', Effect: RetroBitrate, source: RETRO_BITRATE_FRAGMENT, fps: 30 },
];

describe.each(EFFECTS)('$name', ({ Effect, source, fps }) => {
  it('renders nothing, and never touches WebGL, when background effects are off', () => {
    localStorage.setItem('resume_matcher_effects', 'false');
    // The provider reads the stored choice on mount; the effect (lazy-loaded in the app) arrives after.
    const { container, rerender } = render(<EffectsProvider>{null}</EffectsProvider>);
    rerender(on(<Effect />));
    expect(container.firstChild).toBeNull();
    expect(fake.getContext).not.toHaveBeenCalled();
  });

  it('leaves no live canvas when the stored choice turns it off in the same commit', () => {
    localStorage.setItem('resume_matcher_effects', 'false');
    const { container } = render(on(<Effect />));
    expect(container.firstChild).toBeNull();
    // Whatever context the first render opened is released.
    expect(fake.loseContext).toHaveBeenCalledTimes(fake.getContext.mock.calls.length);
  });

  it('renders nothing outside an effects provider (print routes, isolated tests)', () => {
    const { container } = render(<Effect />);
    expect(container.firstChild).toBeNull();
    expect(fake.getContext).not.toHaveBeenCalled();
  });

  it('is an inert, decorative layer that fills its positioned parent', () => {
    const { container } = render(on(<Effect className="-z-10" />));
    const layer = container.firstElementChild as HTMLElement;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer).toHaveClass(
      'pointer-events-none',
      'absolute',
      'inset-0',
      'h-full',
      'w-full',
      '-z-10'
    );
    const canvas = layer.querySelector('canvas')!;
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.height).toBe('100%');
  });

  it('compiles its own shader and fades in over the surface duration once the first frame is drawn', () => {
    const { container } = render(on(<Effect />));
    const layer = container.firstElementChild as HTMLElement;
    expect(fake.gl.shaderSource.mock.calls.map(([, src]) => src)).toContain(source);
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(layer.getAttribute('style')).toContain('transition: opacity 200ms');
    expect(layer.style.opacity).toBe('1');
  });

  it('sets only uniforms its shader declares', () => {
    render(on(<Effect />));
    const names = fake.uniformNames();
    expect(names).toEqual(expect.arrayContaining(['u_time', 'u_resolution', 'u_dpr', 'u_level']));
    for (const name of names) {
      expect(source, `${name} is declared`).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name}\\s*;`));
    }
  });

  it('reads its colours from the --sw-* tokens at runtime', () => {
    render(on(<Effect />));
    const colours = fake
      .uniformNames()
      .filter((n) => !['u_time', 'u_resolution', 'u_dpr', 'u_level'].includes(n));
    expect(colours.length).toBeGreaterThan(0);
    for (const name of colours) {
      const rgb = fake.lastUniform(name)!;
      expect(rgb).toHaveLength(3);
      expect(rgb.every((c) => c >= 0 && c <= 1)).toBe(true);
    }
    // Not the black a missing token would give: the mocked tokens were read.
    expect(colours.some((n) => fake.lastUniform(n)!.some((c) => c > 0))).toBe(true);
  });

  it(`draws at ${fps} fps, only while on screen`, () => {
    render(on(<Effect />));
    expect(fake.requestFrame).not.toHaveBeenCalled();
    fake.intersect(true);
    fake.runFrame(1000);
    const drawn = fake.gl.drawArrays.mock.calls.length;
    fake.runFrame(1000 + 1000 / fps / 2);
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(drawn);
    fake.runFrame(1000 + 1000 / fps + 1);
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(drawn + 1);
  });

  it('draws one still frame and never schedules a frame under reduced motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    render(on(<Effect />));
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(1);
    fake.intersect(true);
    fake.setHidden(false);
    expect(fake.requestFrame).not.toHaveBeenCalled();
    expect(fake.frames.size).toBe(0);
  });

  it('pauses while the tab is hidden', () => {
    render(on(<Effect />));
    fake.intersect(true);
    fake.runFrame(1000);
    expect(fake.frames.size).toBe(1);
    fake.setHidden(true);
    expect(fake.frames.size).toBe(0);
    fake.setHidden(false);
    expect(fake.frames.size).toBe(1);
  });

  it('loses its WebGL context and removes its canvas on unmount', () => {
    const { container, unmount } = render(on(<Effect />));
    fake.intersect(true);
    unmount();
    expect(fake.loseContext).toHaveBeenCalledTimes(1);
    expect(fake.frames.size).toBe(0);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('survives React StrictMode, which mounts, unmounts and mounts again', () => {
    // A canvas whose context was lost hands the same dead context back, so every start needs a
    // fresh canvas: the second mount must end up with exactly one live canvas, drawn on.
    const { container } = render(<StrictMode>{on(<Effect />)}</StrictMode>);
    expect(fake.requested).toHaveLength(2);
    expect(fake.requested[0]).not.toBe(fake.requested[1]);
    expect(fake.loseContext).toHaveBeenCalledTimes(1);
    const live = container.querySelectorAll('canvas');
    expect(live).toHaveLength(1);
    expect(live[0]).toBe(fake.requested[1]);
    fake.intersect(true);
    expect(fake.frames.size).toBe(1);
  });

  it('idle runs at 0.3x speed and dimmer than active, and switching never restarts the context', () => {
    const { rerender } = render(on(<Effect intensity="idle" />));
    fake.intersect(true);
    fake.runFrame(1000);
    fake.runFrame(1100);
    const idleTime = fake.lastUniform('u_time')![0];
    const idleLevel = fake.lastUniform('u_level')![0];
    expect(idleTime).toBeCloseTo(0.03, 5);

    rerender(on(<Effect intensity="active" />));
    expect(fake.getContext).toHaveBeenCalledTimes(1);
    // The speed and brightness ease toward active over a few frames, so time never jumps.
    let now = 1100;
    let prev = idleTime;
    for (let i = 0; i < 60; i++) {
      now += 100;
      fake.runFrame(now);
      const t = fake.lastUniform('u_time')![0];
      expect(t - prev).toBeLessThanOrEqual(0.1 + 1e-9);
      prev = t;
    }
    expect(fake.lastUniform('u_level')![0]).toBeGreaterThan(idleLevel);
    // After settling, one 100 ms frame advances a full 0.1 s of effect time.
    now += 100;
    fake.runFrame(now);
    expect(fake.lastUniform('u_time')![0] - prev).toBeCloseTo(0.1, 2);
  });

  it('repaints its still frame when the intensity changes under reduced motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { rerender } = render(on(<Effect intensity="idle" />));
    const idleLevel = fake.lastUniform('u_level')![0];
    const drawn = fake.gl.drawArrays.mock.calls.length;
    rerender(on(<Effect intensity="active" />));
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(drawn + 1);
    expect(fake.lastUniform('u_level')![0]).toBeGreaterThan(idleLevel);
    expect(fake.requestFrame).not.toHaveBeenCalled();
  });
});

describe('PixelBeams without WebGL', () => {
  it('falls back to the existing DitherField, keeping the call site classes and Steel dots', () => {
    fake.getContext.mockReturnValue(null);
    const { getByTestId } = render(on(<PixelBeams className="-z-10" />));
    const fallback = getByTestId('dither-fallback');
    expect(fallback).toHaveClass('absolute', 'inset-0', '-z-10', 'text-steel');
  });

  it('falls back when the shader does not compile', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fake.gl.getShaderParameter.mockReturnValue(false);
    const { getByTestId } = render(on(<PixelBeams />));
    expect(getByTestId('dither-fallback')).toBeInTheDocument();
  });

  it('falls back when the browser takes the context away', () => {
    const { container, queryByTestId, getByTestId } = render(on(<PixelBeams />));
    expect(queryByTestId('dither-fallback')).toBeNull();
    act(() => {
      container
        .querySelector('canvas')!
        .dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });
    expect(getByTestId('dither-fallback')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden] > canvas')).toBeNull();
  });

  it('shows no fallback when effects are off', () => {
    fake.getContext.mockReturnValue(null);
    localStorage.setItem('resume_matcher_effects', 'false');
    const { container } = render(on(<PixelBeams />));
    expect(container.firstChild).toBeNull();
  });
});

describe('RetroBitrate without WebGL', () => {
  it('renders nothing', () => {
    fake.getContext.mockReturnValue(null);
    const { container } = render(on(<RetroBitrate />));
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the browser takes the context away', () => {
    const { container } = render(on(<RetroBitrate />));
    expect(container.querySelector('canvas')).not.toBeNull();
    act(() => {
      container
        .querySelector('canvas')!
        .dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });
    expect(container.firstChild).toBeNull();
  });
});
