'use client';

import { useState } from 'react';
import {
  GlCanvas,
  type EffectIntensity,
  type IntensityProfile,
} from '@/components/effects/gl-canvas';
import { useEffectsEnabled } from '@/lib/context/effects-context';
import { RETRO_BITRATE_FRAGMENT, RETRO_BITRATE_TOKENS } from '@/lib/effects/shaders/retro-bitrate';
import { cn } from '@/lib/utils';

const FPS = 30;
// Its blocks are 41 px of pixelation, so 2x device pixels would only cost GPU time.
const MAX_DPR = 1;

// `level` is the share of faded-blue blocks among the greys: idle is mostly grey, active has more.
const PROFILES: Record<EffectIntensity, IntensityProfile> = {
  idle: { speed: 0.3, level: 0.15 },
  active: { speed: 1, level: 0.85 },
};

// The canvas draws at 1x DPR and the browser upscales it; keep the block edges crisp.
const PIXELATED = '[image-rendering:pixelated]';

/**
 * Retro Bitrate as a WebGL shader: bit-crushed blocks of grey and faded Hyper Blue on Canvas that
 * churn while AI is working. Fills its positioned parent, is inert and decorative, and renders
 * nothing when background effects are off or WebGL is unavailable. `intensity` `idle` (default)
 * is slow and mostly grey; `active` runs at the preset's own speed with more blue blocks.
 */
export function RetroBitrate({
  className,
  intensity = 'idle',
}: {
  className?: string;
  intensity?: EffectIntensity;
}) {
  const enabled = useEffectsEnabled();
  const [failed, setFailed] = useState(false);
  if (!enabled || failed) return null;
  return (
    <GlCanvas
      className={cn(PIXELATED, className)}
      source={RETRO_BITRATE_FRAGMENT}
      fps={FPS}
      maxDpr={MAX_DPR}
      tokens={RETRO_BITRATE_TOKENS}
      profiles={PROFILES}
      intensity={intensity}
      onFail={() => setFailed(true)}
    />
  );
}
