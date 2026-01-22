import * as React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'outline' | 'ghost';
  noPadding?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', noPadding = false, ...props }, ref) => {
    const baseStyles = 'rounded-none flex flex-col relative';

    const variants = {
      default: 'bg-canvas',
      interactive: cn(
        'bg-canvas border-2 border-transparent', // Initial state
        'transition-all duration-200 ease-in-out',
        'cursor-pointer group',
        'hover:z-20 hover:border-ink hover:shadow-sw-default hover:-translate-y-[2px] hover:-translate-x-[2px]'
      ),
      outline: 'bg-canvas border-2 border-ink',
      ghost: 'bg-transparent border-none shadow-none',
    };

    // Dashboard specific style that was common:
    // border-2 border-dashed border-amber-500 bg-amber-50
    // We can handle specific overrides via className, but the base interactive card
    // in dashboard had: bg-[#F0F0E8] (canvas)

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], !noPadding && 'p-6 md:p-8', className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 mb-4', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('font-serif text-2xl font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-gray-500 font-mono', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex-1', className)} {...props} />
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center pt-4 mt-auto', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
