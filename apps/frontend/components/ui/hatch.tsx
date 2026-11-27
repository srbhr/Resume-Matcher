import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * A 45° line hatch that fills its parent: the drafting mark for an area not in
 * use. It draws in the parent's text colour, or a colour class passed here
 * (`text-steel` reads as blank stock in a dashboard cell; `text-panel-hover` is
 * a quiet ground behind a sheet). `pitch` is the line spacing in px. The parent
 * must be positioned; give it `isolate` and the hatch `-z-10` when content flows
 * over it, and never set text on it without a canvas backing. Decorative, so
 * hidden from assistive technology. Server-safe.
 */
export function Hatch({ className, pitch = 8 }: { className?: string; pitch?: number }) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
    >
      <defs>
        <pattern
          id={id}
          width={pitch}
          height={pitch}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2={pitch} stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
