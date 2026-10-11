import { Suspense, lazy, type ComponentType } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeWizardPage } from '@/components/resume-wizard/resume-wizard-page';
import { EffectsProvider } from '@/lib/context/effects-context';
import { PIXEL_BEAMS_FRAGMENT } from '@/lib/effects/shaders/pixel-beams';
import { RETRO_BITRATE_FRAGMENT } from '@/lib/effects/shaders/retro-bitrate';
import {
  createInitialResumeWizardState,
  postResumeWizardTurn,
  type ResumeWizardState,
} from '@/lib/api';
import { installFakeWebGl } from './fake-webgl';

// The whole chain below the wizard is real (PageFrame, BackgroundEffect, RetroBitrate, GlCanvas,
// the GL runner on a fake WebGL); only the lazy boundary is made in-process.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const Lazy = lazy(async () => ({ default: await loader() }));
    return function Dynamic(props: Record<string, unknown>) {
      return (
        <Suspense fallback={null}>
          <Lazy {...props} />
        </Suspense>
      );
    };
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({ incrementResumes: vi.fn(), setHasMasterResume: vi.fn() }),
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, postResumeWizardTurn: vi.fn() };
});
const mockedPostTurn = vi.mocked(postResumeWizardTurn);

let fake: ReturnType<typeof installFakeWebGl>;

beforeEach(() => {
  localStorage.clear();
  fake = installFakeWebGl();
  vi.mocked(useReducedMotion).mockReturnValue(false);
  vi.stubGlobal('devicePixelRatio', 1);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Draw `count` frames 100 ms apart, so the intensity easing settles. */
function runFrames(count: number, from: number) {
  let now = from;
  for (let i = 0; i < count; i++) {
    now += 100;
    fake.runFrame(now);
  }
  return now;
}

const compiled = () => fake.gl.shaderSource.mock.calls.map(([, src]) => src);

describe('Resume wizard canvas', () => {
  it('keeps one Retro Bitrate canvas and one WebGL context across a busy turn', async () => {
    let resolveTurn!: (value: { state: ResumeWizardState }) => void;
    mockedPostTurn.mockReturnValue(
      new Promise((resolve) => {
        resolveTurn = resolve;
      })
    );
    const { container } = render(
      <EffectsProvider>
        <ResumeWizardPage />
      </EffectsProvider>
    );
    await vi.waitFor(() => expect(container.querySelector('canvas')).not.toBeNull());
    const canvas = container.querySelector('canvas');
    fake.intersect(true);
    const idleAt = runFrames(60, 0);
    const idleLevel = fake.lastUniform('u_level')![0];

    // A busy turn: the intensity rises, the canvas and its context stay.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: "I'm James." } });
    await act(async () =>
      screen.getByRole('button', { name: 'resumeWizard.actions.continue' }).click()
    );
    expect(container.querySelector('canvas')).toBe(canvas);
    const busyAt = runFrames(60, idleAt);
    expect(fake.lastUniform('u_level')![0]).toBeGreaterThan(idleLevel);

    // The turn lands: the intensity falls back, still the same canvas.
    const initial = createInitialResumeWizardState();
    await act(async () => resolveTurn({ state: { ...initial, step: 'review' } }));
    expect(container.querySelector('canvas')).toBe(canvas);
    runFrames(60, busyAt);
    expect(fake.lastUniform('u_level')![0]).toBeCloseTo(idleLevel, 1);

    // One context for the whole visit: never torn down, never a second one, never the beams.
    expect(fake.requested).toEqual([canvas]);
    expect(fake.getContext).toHaveBeenCalledTimes(1);
    expect(fake.loseContext).not.toHaveBeenCalled();
    expect(compiled()).toContain(RETRO_BITRATE_FRAGMENT);
    expect(compiled()).not.toContain(PIXEL_BEAMS_FRAGMENT);
  });
});
