import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss button. 1px ink border, 2px hard shadow, press-in on hover
 * (translate 1px into the shadow). Transition timing comes from the theme
 * default (100ms ease-out-expo), see globals.css.
 *
 * - default: Hyper Blue, the one primary action per region
 * - destructive / outline-destructive: delete, remove
 * - success: confirm, complete
 * - warning: risky but reversible, orange fill with ink text
 * - outline / secondary / ghost / link: everything else
 */
export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline-destructive'
  | 'success'
  | 'warning'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link';

export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-xs';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BASE = cn(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none',
  'font-mono text-sm font-medium uppercase tracking-wide',
  'transition-[transform,box-shadow,background-color,color]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  'disabled:pointer-events-none disabled:opacity-50',
  "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0"
);

const PRESS =
  'shadow-sw-sm hover:translate-x-px hover:translate-y-px hover:shadow-none active:translate-x-[2px] active:translate-y-[2px]';

const VARIANTS: Record<ButtonVariant, string> = {
  default: cn('border border-ink bg-primary text-white hover:bg-primary-hover', PRESS),
  destructive: cn('border border-ink bg-destructive text-white hover:bg-destructive-hover', PRESS),
  'outline-destructive': cn(
    'border border-destructive bg-canvas text-destructive hover:bg-destructive-tint',
    PRESS
  ),
  success: cn('border border-ink bg-success text-white hover:bg-success-hover', PRESS),
  warning: cn('border border-ink bg-warning text-ink hover:bg-warning-hover', PRESS),
  outline: cn('border border-ink bg-canvas text-ink hover:bg-panel', PRESS),
  secondary: cn('border border-ink bg-panel text-ink hover:bg-panel-hover', PRESS),
  ghost: 'border-none bg-transparent text-ink shadow-none hover:bg-panel active:bg-panel-hover',
  link: 'h-auto border-none bg-transparent p-0 text-primary underline-offset-4 shadow-none hover:underline',
};

// WCAG 2.2 AA target size (2.5.8) is 24×24; 44×44 is the house target (2.5.5 AAA).
// The ::before overlay grows compact icon buttons to ~44px of hit area without
// changing layout. Keep a gap-3 or larger between them so hit areas don't overlap.
const HIT = "before:absolute before:-inset-1.5 before:content-['']";
const HIT_XS = "before:absolute before:-inset-1 before:content-['']";

const SIZES: Record<ButtonSize, string> = {
  default: 'h-10 px-6 py-2',
  sm: 'h-8 px-4 py-1 text-xs',
  lg: 'h-12 px-8 py-3 text-base',
  icon: cn('h-11 w-11 p-0', HIT),
  'icon-sm': cn('h-8 w-8 p-0', HIT),
  'icon-xs': cn('h-6 w-6 p-0', HIT_XS),
};

export function buttonClass({
  variant = 'default',
  size = 'default',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button ref={ref} className={buttonClass({ variant, size, className })} {...props} />
  )
);
Button.displayName = 'Button';

export { Button };
