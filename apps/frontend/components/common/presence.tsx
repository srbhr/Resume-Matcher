'use client';

import { AnimatePresence, m } from 'motion/react';
import { DURATION, EASE_OUT_EXPO } from '@/lib/motion';

const fadeIn = (duration: number) => ({
  opacity: 1,
  transition: { duration, ease: EASE_OUT_EXPO },
});
const fadeOut = { opacity: 0, transition: { duration: DURATION.exit, ease: EASE_OUT_EXPO } };

/** Fades a single element in and out (alerts, banners). No animation on first render. */
export function FadePresence({
  show,
  className,
  children,
}: {
  show: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          key="fade"
          className={className}
          initial={{ opacity: 0 }}
          animate={fadeIn(DURATION.surface)}
          exit={fadeOut}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A list item that fades in and out. Wrap the list in <AnimatePresence initial={false}>
 * and key each FadeItem. Neighbours snap; never add `layout`. A dnd-kit node goes *inside*
 * FadeItem, because dnd-kit owns `transform` on its own element.
 */
export function FadeItem({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0 }}
      animate={fadeIn(DURATION.list)}
      exit={fadeOut}
    >
      {children}
    </m.div>
  );
}

export { AnimatePresence };
