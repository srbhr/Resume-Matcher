import * as React from 'react';
import { cn } from '@/lib/utils';

export type PageFrameWidth = 'default' | 'wide';
export type PageFrameHeight = 'auto' | 'screen';

const WIDTH: Record<PageFrameWidth, string> = { default: 'max-w-[86rem]', wide: 'max-w-[104rem]' };

/** The house page frame: blueprint grid on canvas, 1px ink frame, 8px hard shadow. Server-safe. */
export function PageFrame({
  width = 'default',
  height = 'auto',
  className,
  children,
}: {
  width?: PageFrameWidth;
  height?: PageFrameHeight;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-blueprint flex w-full items-start justify-center bg-canvas px-4 py-12 md:px-8',
        height === 'screen' ? 'h-dvh overflow-hidden' : 'min-h-screen'
      )}
    >
      <div
        className={cn(
          'flex w-full flex-col border border-ink bg-canvas shadow-sw-lg',
          WIDTH[width],
          height === 'screen' && 'max-h-full overflow-hidden',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
