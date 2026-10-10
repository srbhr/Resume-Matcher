import * as React from 'react';
import { cn } from '@/lib/utils';

/** The one field-label style, shared with `Dropdown`'s built-in label. */
export const labelClass =
  'font-mono text-xs font-medium uppercase leading-none tracking-wider text-steel';

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        labelClass,
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    />
  )
);
Label.displayName = 'Label';

export { Label };
