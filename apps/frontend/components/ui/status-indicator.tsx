import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'ready' | 'warning' | 'error' | 'active' | 'neutral';

const SQUARE: Record<StatusTone, string> = {
  ready: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  active: 'bg-primary',
  neutral: 'bg-steel',
};

const TEXT: Record<StatusTone, string> = {
  ready: 'text-success',
  warning: 'text-warning-text',
  error: 'text-destructive',
  active: 'text-primary',
  neutral: 'text-steel',
};

/** 12px square + mono label. The label is mandatory, so status never relies on colour alone. Server-safe. */
export function StatusIndicator({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span aria-hidden="true" className={cn('size-3 shrink-0', SQUARE[tone])} />
      <span className={cn('font-mono text-xs font-bold uppercase tracking-wider', TEXT[tone])}>
        {children}
      </span>
    </span>
  );
}
