import type { ExternalToast } from 'sonner';

type Show = (message: string, data?: ExternalToast) => Promise<void>;

/**
 * Lazily loaded sonner. A page that statically imported `toast` carried sonner
 * (about 11 KB gzip) in its first-load JS; this loads it on the first toast.
 * Sonner is one instance, so the toast lands in the stack the layout mounts
 * (`LazyToaster`). A failed load only costs that toast.
 */
function show(kind: 'success' | 'error' | 'info' | 'warning'): Show {
  return (message, data) =>
    import('sonner')
      .then(({ toast }) => {
        toast[kind](message, data);
      })
      .catch((error: unknown) => {
        console.warn('Could not show a notification.', error);
      });
}

export const toast = {
  success: show('success'),
  error: show('error'),
  info: show('info'),
  warning: show('warning'),
};
