'use client';

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from 'react';
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

/**
 * The builder's editor and preview. They paint as a two-column grid (stacked
 * on small screens); on wide screens they become a resizable split once its
 * code (ui-sdk's Resizable, about 19 KB gzip) has loaded after paint, so it
 * stays out of the builder's first-load JS. The panes remount at that switch,
 * which comes while the resume is still loading.
 */
export function SplitPanes({ left, right, handleLabel }: SplitPanesProps) {
  const wide = useWide();
  const [Split, setSplit] = useState<ComponentType<Parameters<typeof ResizableSplit>[0]> | null>(
    null
  );

  useEffect(() => {
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
  }, []);

  if (Split && wide) {
    return <Split left={left} right={right} handleLabel={handleLabel} autoSaveId="builder-split" />;
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 bg-ink gap-px flex-1 min-h-0">
      {left}
      {right}
    </div>
  );
}
