'use client';

import dynamic from 'next/dynamic';

function NoToaster(): null {
  return null;
}

/**
 * The layout's `<Toaster />`, loaded after hydration so sonner stays out of the
 * first-load JS of routes that never show a toast. A page that calls `toast`
 * imports sonner itself and shares the same instance, so its toasts still land
 * in this stack.
 *
 * It mounts outside the layout's error boundary, and in the App Router a failed
 * chunk load throws during render, which would take the whole shell down. So a
 * load failure only costs the toasts.
 */
export const LazyToaster = dynamic(
  () =>
    import('./toaster')
      .then((mod) => mod.Toaster)
      .catch((error: unknown) => {
        console.warn('Toaster failed to load; notifications are disabled.', error);
        return NoToaster;
      }),
  { ssr: false }
);
