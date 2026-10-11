import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Swiss International Style Input Component
 *
 * Design Principles:
 * - Square corners (rounded-none) - Brutalist aesthetic
 * - Black border for high contrast
 * - Focus ring in Hyper Blue
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full border border-ink bg-white px-3 py-2 text-sm',
          // Swiss style: hard borders only, no soft shadow on inputs.
          'placeholder:text-steel aria-invalid:border-destructive',
          'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'rounded-none',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
