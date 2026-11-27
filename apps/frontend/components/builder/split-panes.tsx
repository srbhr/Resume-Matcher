'use client';

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ResizableSplit } from '@/components/ui/resizable-split';

const WIDE = '(min-width: 1024px)';

function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => window.matchMedia(WIDE).matches,
    () => false
  );
}

interface SplitPanesProps {
  left: ReactNode;
  right: ReactNode;
  handleLabel: string;
}

interface PaneHosts {
  left: HTMLDivElement;
  right: HTMLDivElement;
}

function makeHost(): HTMLDivElement {
  const host = document.createElement('div');
  // The pane lays out as a direct child of the grid cell or split panel it sits in.
  host.style.display = 'contents';
  return host;
}

/**
 * The builder's editor and preview. They paint as a two-column grid (stacked
 * on small screens); on wide screens they become a resizable split once its
 * code (ui-sdk's Resizable, about 19 KB gzip) has loaded after paint, so it
 * stays out of the builder's first-load JS. That code is only fetched on a
 * wide screen.
 *
 * Grid and split are different element trees, so a pane rendered inside one
 * would remount when the layout changes: when the split's code arrives, or the
 * window crosses 1024px. That would drop a Writing proposal waiting for review,
 * an ATS report, open entries and the preview's zoom. So once mounted, each pane
 * renders through a portal into its own host element, and the layout only moves
 * the two hosts between its slots. The panes render in place for the server
 * render and hydration, then move into their hosts once, before anything loads.
 */
export function SplitPanes({ left, right, handleLabel }: SplitPanesProps) {
  const wide = useWide();
  const [Split, setSplit] = useState<ComponentType<Parameters<typeof ResizableSplit>[0]> | null>(
    null
  );
  const [hosts, setHosts] = useState<PaneHosts | null>(null);

  useEffect(() => {
    setHosts({ left: makeHost(), right: makeHost() });
  }, []);

  useEffect(() => {
    if (!wide || Split) return;
    let cancelled = false;
    import('@/components/ui/resizable-split')
      .then((module) => {
        if (!cancelled) setSplit(() => module.ResizableSplit);
      })
      .catch((error: unknown) => {
        console.warn('Resizable split failed to load; keeping the fixed columns.', error);
      });
    return () => {
      cancelled = true;
    };
  }, [wide, Split]);

  // Slots put the hosts back into whichever layout is on screen, in order.
  const gridSlot = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && hosts) el.append(hosts.left, hosts.right);
    },
    [hosts]
  );
  const leftSlot = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && hosts) el.append(hosts.left);
    },
    [hosts]
  );
  const rightSlot = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && hosts) el.append(hosts.right);
    },
    [hosts]
  );

  const gridClass = 'grid grid-cols-1 lg:grid-cols-2 bg-ink gap-px flex-1 min-h-0';

  if (!hosts) {
    return (
      <div className={gridClass}>
        {left}
        {right}
      </div>
    );
  }

  return (
    <>
      {Split && wide ? (
        <Split
          left={<div ref={leftSlot} className="contents" />}
          right={<div ref={rightSlot} className="contents" />}
          handleLabel={handleLabel}
          autoSaveId="builder-split"
        />
      ) : (
        <div ref={gridSlot} className={gridClass} />
      )}
      {createPortal(left, hosts.left)}
      {createPortal(right, hosts.right)}
    </>
  );
}
