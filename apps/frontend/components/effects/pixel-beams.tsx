'use client';

import { useState } from 'react';
import { DitherField } from '@/components/effects/dither-field';
import {
  GlCanvas,
  type EffectIntensity,
  type IntensityProfile,
} from '@/components/effects/gl-canvas';
import { useEffectsEnabled } from '@/lib/context/effects-context';
import { PIXEL_BEAMS_FRAGMENT, PIXEL_BEAMS_TOKENS } from '@/lib/effects/shaders/pixel-beams';
import { cn } from '@/lib/utils';

const FPS = 24;

// `level` is how opaque the Steel dots are over Canvas: always a quiet grey texture.
const PROFILES: Record<EffectIntensity, IntensityProfile> = {
  idle: { speed: 0.3, level: 0.26 },
  active: { speed: 1, level: 0.36 },
};

const FILL = 'pointer-events-none absolute inset-0 h-full w-full';

/**
 * Pixel Beams as a WebGL shader: diagonal beams of square dots in grey on Canvas. Fills its
 * positioned parent, is inert and decorative, and renders nothing when background effects are off.
 * `intensity` `idle` (default) drifts slowly and dim; `active` runs at the preset's own speed.
 * Falls back to the canvas-2D `DitherField` when WebGL is unavailable.
 */
export function PixelBeams({
  className,
  intensity = 'idle',
}: {
  className?: string;
  intensity?: EffectIntensity;
}) {
  const enabled = useEffectsEnabled();
  const [failed, setFailed] = useState(false);
  if (!enabled) return null;
  if (failed) return <DitherField className={cn(FILL, 'text-steel', className)} />;
  return (
    <GlCanvas
      className={className}
      source={PIXEL_BEAMS_FRAGMENT}
      fps={FPS}
      tokens={PIXEL_BEAMS_TOKENS}
      profiles={PROFILES}
      intensity={intensity}
      onFail={() => setFailed(true)}
    />
  );
}
