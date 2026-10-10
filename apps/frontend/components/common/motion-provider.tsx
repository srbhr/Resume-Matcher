'use client';

import { LazyMotion, MotionConfig } from 'motion/react';
import { DURATION, EASE_OUT_EXPO } from '@/lib/motion';

const loadFeatures = () => import('./motion-features').then((mod) => mod.default);

/**
 * Lazy Motion for the app. `strict` throws if anyone renders `motion.*` instead
 * of `m.*`; nothing visible at first paint may depend on Motion.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: DURATION.surface, ease: EASE_OUT_EXPO }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
