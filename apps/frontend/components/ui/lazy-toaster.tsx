'use client';

import dynamic from 'next/dynamic';

/**
 * The layout's `<Toaster />`, loaded after hydration so sonner stays out of the
 * first-load JS of routes that never show a toast. A page that calls `toast`
 * imports sonner itself and shares the same instance, so its toasts still land
 * in this stack.
 */
export const LazyToaster = dynamic(() => import('./toaster').then((mod) => mod.Toaster), {
  ssr: false,
});
