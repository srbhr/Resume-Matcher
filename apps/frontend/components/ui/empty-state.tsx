import * as React from 'react';
import { cn } from '@/lib/utils';
import { Crosses } from './crosses';

/**
 * Swiss empty state: left-aligned mono label, one line of copy, at most one action.
 * `framed` marks an empty list slot, a draft-like state where the pack allows dashed borders.
 * `field` sets the message on a canvas plate over the cross field: a surface waiting for
 * work (an empty queue, a stage with no cards). Server-safe.
 */
export function EmptyState({
  title,
  description,
  action,
  variant = 'plain',
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: 'plain' | 'framed' | 'field';
  className?: string;
}) {
  if (variant === 'field') {
    return (
      <div
        className={cn(
          'relative isolate flex items-start overflow-hidden border border-dashed border-steel p-6',
          className
        )}
      >
        <Crosses className="-z-10 text-steel" />
        <div className="flex max-w-md flex-col items-start gap-2 border border-ink bg-canvas p-4 text-left">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink">{title}</p>
          {description && <p className="text-sm text-ink-soft text-pretty">{description}</p>}
          {action && <div className="mt-2">{action}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-start gap-2 text-left',
        variant === 'framed' ? 'border border-dashed border-steel bg-paper p-6' : 'py-6',
        className
      )}
    >
      <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink">{title}</p>
      {description && (
        <p className="max-w-[60ch] text-sm text-ink-soft text-pretty">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
