import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * A 45° line hatch that fills its parent: the drafting mark for an area not in
 * use. It draws in the parent's text colour (`text-steel` on canvas reads as
 * blank stock). The parent must be positioned. Decorative, so hidden from
 * assistive technology. Server-safe.
 */
export function Hatch({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
    >
      <defs>
        <pattern
          id={id}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
