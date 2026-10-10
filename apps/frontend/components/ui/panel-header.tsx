import * as React from 'react';
import { cn } from '@/lib/utils';

export type PanelTone = 'input' | 'output' | 'neutral';

const SQUARE: Record<PanelTone, string> = {
  input: 'bg-primary',
  output: 'bg-success',
  neutral: 'bg-ink',
};

/** Swiss panel header: role square + mono caption, optional right-hand actions. Server-safe. */
export function PanelHeader({
  tone = 'neutral',
  title,
  level: Heading = 'h2',
  children,
  className,
}: {
  tone?: PanelTone;
  title: React.ReactNode;
  level?: 'h2' | 'h3';
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-4 flex items-center justify-between gap-4 border-b-2 border-ink pb-2',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className={cn('size-3 shrink-0', SQUARE[tone])} />
        <Heading className="truncate font-mono text-xs font-bold uppercase tracking-wider text-ink">
          {title}
        </Heading>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
