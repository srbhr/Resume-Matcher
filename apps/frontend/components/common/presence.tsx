'use client';

import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { DURATION, EASE_OUT_EXPO } from '@/lib/motion';
import { cn } from '@/lib/utils';

const fadeIn = (duration: number) => ({
  opacity: 1,
  transition: { duration, ease: EASE_OUT_EXPO },
});
const fadeOut = { opacity: 0, transition: { duration: DURATION.exit, ease: EASE_OUT_EXPO } };

/**
 * AnimatePresence keeps an exiting subtree mounted, with live handlers, for the length of
 * the exit. A second click on an exiting row's Delete would fire a stale handler (and
 * remove the next item once indices shift), so once it is no longer present it is inert
 * and click-through. Mirrors DialogLayer and Listbox.
 */
const exitingProps = (isPresent: boolean, className?: string) => ({
  inert: !isPresent,
  className: cn(className, !isPresent && 'pointer-events-none'),
});

/** The presence child of FadePresence: it must be its own component to read useIsPresent. */
function FadeLayer({ className, children }: { className?: string; children: React.ReactNode }) {
  const isPresent = useIsPresent();
  return (
    <m.div
      {...exitingProps(isPresent, className)}
      initial={{ opacity: 0 }}
      animate={fadeIn(DURATION.surface)}
      exit={fadeOut}
    >
      {children}
    </m.div>
  );
}

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
        <FadeLayer key="fade" className={className}>
          {children}
        </FadeLayer>
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
  const isPresent = useIsPresent();
  return (
    <m.div
      {...exitingProps(isPresent, className)}
      initial={{ opacity: 0 }}
      animate={fadeIn(DURATION.list)}
      exit={fadeOut}
    >
      {children}
    </m.div>
  );
}

export { AnimatePresence };
