import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss International Style Button Component
 *
 * Design Principles:
 * - Hard shadows (no blur) that create depth
 * - Square corners (rounded-none) - Brutalist aesthetic
 * - High contrast black borders
 * - Hover: translate + shadow removal creates "press" effect
 * - Clear semantic variants for different actions
 */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual variant determining color and purpose:
   * - `default`: Hyper Blue (#1D4ED8) - Primary actions (save, submit, create)
   * - `destructive`: Alert Red (#DC2626) - Destructive actions (delete, remove)
   * - `success`: Signal Green (#15803D) - Positive actions (download, confirm, complete)
   * - `warning`: Alert Orange (#F97316) - Caution actions (reset, clear, undo)
   * - `outline`: Transparent + black border - Secondary actions (cancel, back)
   * - `secondary`: Panel Grey (#E5E5E0) - Tertiary actions
   * - `ghost`: No background - Subtle actions (icon buttons, navigation)
   * - `link`: Text only with underline - Inline links
   */
  variant?:
    | 'default'
    | 'destructive'
    | 'success'
    | 'warning'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  /**
   * Button size:
   * - `default`: Standard button (h-10)
   * - `sm`: Small button (h-8)
   * - `lg`: Large button (h-12)
   * - `icon`: Square icon button (h-9 w-9)
   */
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    // Base styles applied to ALL buttons
    // Swiss Design: clean, functional, high contrast
    const baseStyles = cn(
      // Layout & Typography
      'relative inline-flex items-center justify-center gap-2',
      'whitespace-nowrap text-sm font-medium font-mono uppercase tracking-wide',
      // Transitions — only the properties that actually change on hover/active.
      // Avoids the perf footgun of `transition-all` and matches Swiss "snap" feel.
      'transition-[transform,box-shadow,background-color] duration-100 ease-out',
      // Focus state - sharp blue ring (not soft glow)
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      // Disabled state
      'disabled:pointer-events-none disabled:opacity-50',
      // SVG icon sizing
      "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
      // Swiss Design: NO rounded corners
      'rounded-none'
    );

    // Hit-area expansion for icon-only buttons. Many call sites override
    // size="icon" with smaller h-X w-X classes for dense toolbars (h-8 w-8,
    // h-7 w-7, etc.) — those visible sizes are under WCAG 2.5.8's 44×44 target
    // size minimum. The ::before pseudo-element extends the touch area by 6px
    // on each side without affecting visible layout, so a 32×32 button gets a
    // 44×44 touch target. For h-7 and smaller, the touch area still falls
    // short — those need an additional inline override at the call site
    // (e.g. before:-inset-[10px]).
    const iconHitArea = "before:absolute before:-inset-1.5 before:content-['']";

    // Variant styles - each has distinct purpose and color
    const variants = {
      // PRIMARY - Hyper Blue (#1D4ED8 / blue-700)
      // Use for: Save, Submit, Create, Primary CTA
      default: cn(
        'bg-primary text-primary-foreground',
        'border border-border',
        'shadow-sw-sm',
        'hover:bg-primary/90',
        'hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none',
        'active:translate-y-[2px] active:translate-x-[2px]'
      ),

      destructive: cn(
        'bg-destructive text-destructive-foreground',
        'border border-border',
        'shadow-sw-sm',
        'hover:bg-destructive/90',
        'hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none',
        'active:translate-y-[2px] active:translate-x-[2px]'
      ),

      success: cn(
        'bg-success text-on-accent',
        'border border-border',
        'shadow-sw-sm',
        'hover:bg-success/90',
        'hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none',
        'active:translate-y-[2px] active:translate-x-[2px]'
      ),

      warning: cn(
        'bg-warning text-on-accent',
        'border border-border',
        'shadow-sw-sm',
        'hover:bg-warning/90',
        'hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none',
        'active:translate-y-[2px] active:translate-x-[2px]'
      ),

      outline: cn(
        'bg-background text-foreground',
        'border border-border',
        'shadow-sw-sm',
        'hover:bg-secondary',
        'hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none',
        'active:translate-y-[2px] active:translate-x-[2px]'
      ),

      secondary: cn(
        'bg-secondary text-secondary-foreground',
        'border border-border',
        'shadow-sw-sm',
        'hover:bg-accent',
        'hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none',
        'active:translate-y-[2px] active:translate-x-[2px]'
      ),

      ghost: cn(
        'bg-transparent text-foreground',
        'border-none shadow-none',
        'hover:bg-paper-tint',
        'active:bg-paper-tint'
      ),

      link: cn(
        'bg-transparent text-primary',
        'border-none shadow-none',
        'underline-offset-4 hover:underline',
        'p-0 h-auto'
      ),
    };

    // Size styles. Icon variant is 44×44px to meet WCAG 2.2 AA target size
    // (success criterion 2.5.8). Call sites that override the visible size
    // with smaller h-X w-X classes get the touch-area expansion via the
    // iconHitArea overlay above.
    const sizes = {
      default: 'h-10 px-6 py-2',
      sm: 'h-8 px-4 py-1 text-xs',
      lg: 'h-12 px-8 py-3 text-base',
      icon: cn('h-11 w-11 p-0', iconHitArea),
    };

    const variantClass = variants[variant];
    const sizeClass = sizes[size];

    return (
      <button ref={ref} className={cn(baseStyles, variantClass, sizeClass, className)} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button };
