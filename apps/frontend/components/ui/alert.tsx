import * as React from 'react';
import { cn } from '@/lib/utils';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const TONE: Record<AlertTone, { box: string; label: string }> = {
  info: { box: 'border-primary bg-info-tint', label: 'text-primary' },
  success: { box: 'border-success bg-success-tint', label: 'text-success' },
  warning: { box: 'border-warning bg-warning-tint', label: 'text-warning-text' },
  error: { box: 'border-destructive bg-destructive-tint', label: 'text-destructive' },
};

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  title?: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
}

/** Swiss alert: 2px tone border on a tint, mono label, ink-soft body, no shadow. Server-safe. */
export function Alert({ tone = 'info', title, children, className, ref, ...props }: AlertProps) {
  return (
    <div
      ref={ref}
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('rounded-none border-2 p-4', TONE[tone].box, className)}
      {...props}
    >
      {title && (
        <p
          className={cn(
            'mb-1 font-mono text-sm font-bold uppercase tracking-wider',
            TONE[tone].label
          )}
        >
          {title}
        </p>
      )}
      {children && <div className="font-sans text-sm text-ink-soft text-pretty">{children}</div>}
    </div>
  );
}
