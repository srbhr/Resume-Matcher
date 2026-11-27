import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * A field of small crosses at module intersections: the drawing surface a sheet
 * stands on (the hatch, by contrast, means "not in use"). It fills its parent and
 * draws in the parent's text colour, or a colour class passed here (`text-steel`
 * is the house field). `pitch` is the module in px; arms are 7px, with 1px
 * strokes on whole pixels so they stay crisp. The parent must be positioned; give
 * it `isolate` and the crosses `-z-10` when content flows over them, and never set
 * text on them without a canvas backing. Decorative, static, and not printed.
 * Server-safe.
 */
export function Crosses({ className, pitch = 32 }: { className?: string; pitch?: number }) {
  const id = useId();
  const c = Math.round(pitch / 2);
  return (
    <svg
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 size-full print:hidden', className)}
    >
      <defs>
        <pattern id={id} width={pitch} height={pitch} patternUnits="userSpaceOnUse">
          <path
            d={`M${c - 3} ${c + 0.5}h7M${c + 0.5} ${c - 3}v7`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            shapeRendering="crispEdges"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
