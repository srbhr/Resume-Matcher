import * as React from 'react';
import { cn } from '@/lib/utils';

export type PageFrameWidth = 'narrow' | 'default' | 'wide';
/** screen: fills the viewport and its panes scroll; screen-md: that from md up, a normal page below. */
export type PageFrameHeight = 'auto' | 'screen' | 'screen-md';

const WIDTH: Record<PageFrameWidth, string> = {
  narrow: 'max-w-4xl',
  default: 'max-w-[86rem]',
  wide: 'max-w-[104rem]',
};

/** The house page frame: Canvas page, 1px ink frame, 8px hard shadow. Server-safe. */
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
        'relative isolate flex w-full items-start justify-center bg-canvas px-4 py-12 md:px-8',
        height === 'screen'
          ? 'h-dvh overflow-hidden'
          : height === 'screen-md'
            ? 'min-h-screen md:h-dvh md:min-h-0 md:overflow-hidden'
            : 'min-h-screen'
      )}
    >
      <div
        className={cn(
          'flex w-full flex-col border border-ink bg-canvas shadow-sw-lg',
          WIDTH[width],
          height === 'screen' && 'max-h-full overflow-hidden',
          height === 'screen-md' && 'md:max-h-full md:overflow-hidden',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
