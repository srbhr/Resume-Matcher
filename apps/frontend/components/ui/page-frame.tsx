import * as React from 'react';
import { cn } from '@/lib/utils';
import { Crosses } from './crosses';

/** card: a portrait sheet for one focused task (Tailor). */
export type PageFrameWidth = 'card' | 'narrow' | 'default' | 'wide';
/** screen: fills the viewport and its panes scroll; screen-md: that from md up, a normal page below. */
export type PageFrameHeight = 'auto' | 'screen' | 'screen-md';

/**
 * The page ground behind the frame. crosses: the drawing-board field from md up
 * (a narrow card leaves room for it at every desktop width). crosses-wide: the
 * same field only from 2xl (1536px), for full-width frames, whose 32px side
 * margins are too thin for a pattern to read below that. Beside a wide frame (and
 * the dashboard's hatched cells) the 32px module reads busy, so it opens to 48px.
 */
export type PageFrameGround = 'none' | 'crosses' | 'crosses-wide';

const WIDTH: Record<PageFrameWidth, string> = {
  card: 'max-w-[42rem]',
  narrow: 'max-w-4xl',
  default: 'max-w-[86rem]',
  wide: 'max-w-[104rem]',
};

/** The house page frame: Canvas page, 1px ink frame, 8px hard shadow. Server-safe. */
export function PageFrame({
  width = 'default',
  height = 'auto',
  ground = 'none',
  className,
  children,
}: {
  width?: PageFrameWidth;
  height?: PageFrameHeight;
  ground?: PageFrameGround;
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
      {ground !== 'none' && (
        <Crosses
          pitch={ground === 'crosses' ? 32 : 48}
          className={cn('-z-10 hidden text-steel', ground === 'crosses' ? 'md:block' : '2xl:block')}
        />
      )}
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
