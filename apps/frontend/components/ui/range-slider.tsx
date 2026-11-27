import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A native range input in the Swiss look: a 4px panel-hover track and a square
 * 16px ink thumb (the browser's round thumb is the one rounded control left),
 * with the house focus ring. All `<input>` props pass through. Server-safe.
 */
export const RangeSlider = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function RangeSlider({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="range"
      className={cn(
        'h-4 w-full cursor-pointer appearance-none bg-transparent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // WebKit / Blink
        '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-panel-hover',
        '[&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-ink',
        // Firefox
        '[&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-panel-hover',
        '[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:bg-ink',
        '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink',
        className
      )}
      {...props}
    />
  );
});
