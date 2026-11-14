'use client';

import { CheckCircle, Info, Warning, WarningCircle, X } from '@phosphor-icons/react';
import { Toaster as SonnerToaster, toast } from 'sonner';
import { useTranslations } from '@/lib/i18n';

/**
 * Non-blocking notifications. Call `toast.success(message)` (or `.error`,
 * `.warning`, `.info`) from anywhere under the `(default)` layout, which mounts
 * one `<Toaster />` (through `LazyToaster`). Import `toast` from here, not from
 * `sonner`, so every toast gets the Swiss styling below.
 *
 * Use a toast for an outcome the user doesn't have to act on ("Resume
 * downloaded"). Keep `ConfirmDialog` for choices and for errors that offer a retry.
 */
export { toast };

// Sonner runs unstyled: these classes are the whole look. Its runtime stylesheet
// still positions and animates the stack (and drops the animation under
// prefers-reduced-motion); the focus ring it would add is overridden in globals.css.
const CLASS_NAMES = {
  toast:
    'flex w-full items-start gap-3 rounded-none border border-ink bg-white p-4 font-sans shadow-sw-default',
  content: 'flex min-w-0 flex-1 flex-col gap-1',
  title: 'text-sm font-bold text-ink text-pretty',
  description: 'text-sm text-ink-soft text-pretty',
  icon: 'mt-px flex shrink-0',
  success: '[&_[data-icon]]:text-success',
  error: '[&_[data-icon]]:text-destructive',
  warning: '[&_[data-icon]]:text-warning-text',
  info: '[&_[data-icon]]:text-primary',
  closeButton:
    'order-last -m-1 inline-flex shrink-0 items-center justify-center p-1 text-steel hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
  actionButton:
    'shrink-0 self-center border border-ink bg-primary px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-white shadow-sw-sm hover:bg-primary-hover',
};

const ICONS = {
  success: <CheckCircle size={20} aria-hidden="true" />,
  error: <WarningCircle size={20} aria-hidden="true" />,
  warning: <Warning size={20} aria-hidden="true" />,
  info: <Info size={20} aria-hidden="true" />,
  close: <X size={16} aria-hidden="true" />,
};

/** The toast stack: bottom right, one per app shell. Never mount it under `app/print/**`. */
export function Toaster() {
  const { t } = useTranslations();
  return (
    <SonnerToaster
      theme="light"
      position="bottom-right"
      closeButton
      icons={ICONS}
      containerAriaLabel={t('common.notifications')}
      toastOptions={{
        unstyled: true,
        classNames: CLASS_NAMES,
        closeButtonAriaLabel: t('common.dismissNotification'),
      }}
    />
  );
}
