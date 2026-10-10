'use client';

import { useState } from 'react';
import {
  GlCanvas,
  type EffectIntensity,
  type IntensityProfile,
} from '@/components/effects/gl-canvas';
import { useEffectsEnabled } from '@/lib/context/effects-context';
import { RETRO_BITRATE_FRAGMENT, RETRO_BITRATE_TOKENS } from '@/lib/effects/shaders/retro-bitrate';

const FPS = 30;

// `level` dims the field toward Ink: idle is a subdued backdrop, active full brightness.
const PROFILES: Record<EffectIntensity, IntensityProfile> = {
  idle: { speed: 0.3, level: 0.5 },
  active: { speed: 1, level: 1 },
};

/**
 * Retro Bitrate as a WebGL shader: bit-crushed blocks of Hyper Blue and Ink that churn while AI
 * is working. Fills its positioned parent, is inert and decorative, and renders nothing when
 * background effects are off or WebGL is unavailable. `intensity` `idle` (default) is slow and
 * dim; `active` runs at the preset's own speed and full brightness.
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
      className={className}
      source={RETRO_BITRATE_FRAGMENT}
      fps={FPS}
      tokens={RETRO_BITRATE_TOKENS}
      profiles={PROFILES}
      intensity={intensity}
      onFail={() => setFailed(true)}
    />
  );
}
