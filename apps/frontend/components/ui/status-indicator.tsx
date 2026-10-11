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

/**
 * 12px square + mono label. The label is mandatory, so status never relies on colour alone. Server-safe.
 * It is a live region, so a label that changes (checking, then connected) is announced. Pass
 * `live={false}` inside a region that already announces its content (an Alert, a role="status"
 * wrapper), or the same change is read out twice.
 */
export function StatusIndicator({
  tone,
  children,
  className,
  live = true,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
  live?: boolean;
}) {
  return (
    <span
      role={live ? 'status' : undefined}
      className={cn('inline-flex items-center gap-2', className)}
    >
      <span aria-hidden="true" className={cn('size-3 shrink-0', SQUARE[tone])} />
      <span className={cn('font-mono text-xs font-bold uppercase tracking-wider', TEXT[tone])}>
        {children}
      </span>
    </span>
  );
}
