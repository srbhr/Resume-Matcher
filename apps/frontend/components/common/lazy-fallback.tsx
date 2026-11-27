'use client';

import type { ComponentType } from 'react';
import { Alert } from '@/components/ui/alert';
import { useTranslations } from '@/lib/i18n';

/**
 * For a `next/dynamic` loader. In the App Router a chunk that fails to load (a
 * tab left open across an upgrade, a dropped connection) throws while
 * rendering, and the route's error boundary replaces the whole page. Wrapped in
 * this, the failure is logged and only the lazy part is replaced, by `fallback`.
 *
 *   dynamic(() => withFallback(import('./panel').then((m) => m.Panel), 'Panel', PartLoadFailed))
 *
 * The import stays inline in the loader, where Next finds it to split the chunk.
 */
export function withFallback<P>(
  load: Promise<ComponentType<P>>,
  what: string,
  fallback: ComponentType<P>
): Promise<ComponentType<P>> {
  return load.catch((error: unknown) => {
    console.warn(`${what} failed to load.`, error);
    return fallback;
  });
}

/** Shown in place of a panel whose code failed to load. */
export function PartLoadFailed() {
  const { t } = useTranslations();
  return <Alert tone="error">{t('common.partLoadFailed')}</Alert>;
}

/** For a lazy part that is only an extra (a menu): nothing in its place. */
export function NothingLoaded(): null {
  return null;
}
