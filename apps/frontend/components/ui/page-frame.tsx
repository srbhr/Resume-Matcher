import * as React from 'react';
import {
  BackgroundEffect,
  type BackgroundEffectKind,
} from '@/components/effects/background-effect';
import type { EffectIntensity } from '@/components/effects/gl-canvas';
import { cn } from '@/lib/utils';

export type PageFrameWidth = 'narrow' | 'default' | 'wide';
export type PageFrameHeight = 'auto' | 'screen';

const WIDTH: Record<PageFrameWidth, string> = {
  narrow: 'max-w-4xl',
  default: 'max-w-[86rem]',
  wide: 'max-w-[104rem]',
};

/**
 * The house page frame: background effect on canvas (grey pixel beams unless `effect` says
 * otherwise; `effectIntensity` is `idle` or `active`), 1px ink frame, 8px hard shadow. Server-safe.
 */
export function PageFrame({
  width = 'default',
  height = 'auto',
  effect = 'beams',
  effectIntensity = 'idle',
  className,
  children,
}: {
  width?: PageFrameWidth;
  height?: PageFrameHeight;
  effect?: BackgroundEffectKind;
  effectIntensity?: EffectIntensity;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative isolate flex w-full items-start justify-center bg-canvas px-4 py-12 md:px-8',
        height === 'screen' ? 'h-dvh overflow-hidden' : 'min-h-screen'
      )}
    >
      <BackgroundEffect effect={effect} intensity={effectIntensity} />
      <div
        className={cn(
          'flex w-full flex-col border border-ink bg-canvas shadow-sw-lg',
          WIDTH[width],
          height === 'screen' && 'max-h-full overflow-hidden',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
