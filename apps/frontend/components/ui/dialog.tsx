'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { AnimatePresence, m, useIsPresent, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { DURATION, EASE_OUT_EXPO, SPRING } from '@/lib/motion';
import { useTranslations } from '@/lib/i18n';
import { Button } from './button';

/**
 * Swiss dialog: white panel, 1px ink border, 8px hard shadow, banded header and
 * footer, focus moved in, trapped, and returned on close.
 */

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dismissible: boolean;
  titleId: string;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

const useDialogContext = () => {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error('Dialog components must be used within a Dialog');
  }
  return context;
};

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Set to false for a forced choice: no Close button, and Escape and a backdrop click do
   * nothing. `onOpenChange` still drives the dialog's own buttons.
   */
  dismissible?: boolean;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, dismissible = true, children }) => {
  // Stable id per dialog instance for aria-labelledby wiring to DialogTitle.
  const titleId = React.useId();
  return (
    <DialogContext.Provider value={{ open, onOpenChange, dismissible, titleId }}>
      {children}
    </DialogContext.Provider>
  );
};

interface DialogTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

const DialogTrigger: React.FC<DialogTriggerProps> = ({ asChild, children }) => {
  const { onOpenChange } = useDialogContext();

  if (asChild && React.isValidElement(children)) {
    const childProps = (children as React.ReactElement<{ onClick?: () => void }>).props;
    const originalOnClick = childProps.onClick;
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => {
        originalOnClick?.();
        onOpenChange(true);
      },
    });
  }

  return <button onClick={() => onOpenChange(true)}>{children}</button>;
};

interface DialogCloseProps {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}

const DialogClose: React.FC<DialogCloseProps> = ({ asChild, children, className }) => {
  const { onOpenChange } = useDialogContext();

  if (asChild && React.isValidElement(children)) {
    const childProps = (children as React.ReactElement<{ onClick?: () => void }>).props;
    const originalOnClick = childProps.onClick;
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => {
        originalOnClick?.();
        onOpenChange(false);
      },
    });
  }

  return (
    <button onClick={() => onOpenChange(false)} className={className}>
      {children}
    </button>
  );
};

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<DialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

// display:none elements (e.g. the hidden file input in the upload dialog) can't take focus.
const focusableIn = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => getComputedStyle(el).display !== 'none'
  );

/**
 * The layer AnimatePresence keeps mounted while the dialog exits. The exiting
 * subtree still has live handlers (a second click on a confirm button would
 * fire it again), so once it is no longer present it is inert and click-through.
 */
const DialogLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isPresent = useIsPresent();
  return (
    <div
      className={cn('fixed inset-0 z-50', !isPresent && 'pointer-events-none')}
      inert={!isPresent}
    >
      {children}
    </div>
  );
};

// Open dialogs, bottom to top. Escape closes only the top one, and the body scroll lock
// is released only when the last one closes.
const openDialogs: symbol[] = [];
let bodyLocks = 0;
// One keypress closes one dialog. A browser can flush React between two keydown listeners,
// which would make the dialog underneath the new top before its own listener runs.
const handledEscapes = new WeakSet<Event>();

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
  size?: DialogSize;
  /** Element to focus on open. Defaults to the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const DialogContent: React.FC<DialogContentProps> = ({
  children,
  className,
  size = 'md',
  initialFocusRef,
}) => {
  const { open, onOpenChange, dismissible, titleId } = useDialogContext();
  const { t } = useTranslations();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const idRef = React.useRef(Symbol('dialog'));
  // Reduced motion: the panel only fades, it does not scale (spec §7).
  const reducedMotion = useReducedMotion();
  const panelScale = reducedMotion ? 1 : 0.95;

  // Registration depends only on `open`, so a parent re-render never reorders the stack.
  React.useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    openDialogs.push(id);
    bodyLocks += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      const i = openDialogs.indexOf(id);
      if (i >= 0) openDialogs.splice(i, 1);
      bodyLocks -= 1;
      if (bodyLocks === 0) document.body.style.overflow = '';
    };
  }, [open]);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        open &&
        dismissible &&
        openDialogs[openDialogs.length - 1] === idRef.current &&
        !handledEscapes.has(e)
      ) {
        handledEscapes.add(e);
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, dismissible, onOpenChange]);

  // Focus contract: move focus in on open, give it back to the opener on close.
  // Don't use autoFocus inside a dialog: React applies it before this effect runs,
  // so the opener is never recorded. The first focusable element gets focus anyway.
  // On close, the opener only gets focus back if nothing else claimed it (a close
  // handler may have focused something on purpose, e.g. the editor behind a link dialog).
  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      (initialFocusRef?.current ?? focusableIn(panel)[0] ?? panel).focus();
    }
    return () => {
      const active = document.activeElement;
      if (!active || active === document.body || panel?.contains(active)) opener?.focus();
    };
  }, [open, initialFocusRef]);

  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = focusableIn(panelRef.current);
    if (items.length === 0) {
      e.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <DialogLayer key="dialog">
          <m.div
            className="fixed inset-0 bg-overlay"
            aria-hidden="true"
            onClick={() => {
              if (dismissible) onOpenChange(false);
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: DURATION.surface, ease: EASE_OUT_EXPO },
            }}
            exit={{ opacity: 0, transition: { duration: DURATION.exit, ease: EASE_OUT_EXPO } }}
          />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <m.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              onKeyDown={trapTab}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: panelScale }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: {
                  opacity: { duration: DURATION.surface, ease: EASE_OUT_EXPO },
                  scale: SPRING,
                },
              }}
              exit={{
                opacity: 0,
                scale: panelScale,
                transition: { duration: DURATION.exit, ease: EASE_OUT_EXPO },
              }}
              className={cn(
                'relative flex max-h-[90vh] w-full flex-col overflow-hidden',
                'rounded-none border border-ink bg-white shadow-sw-lg outline-none',
                SIZE_CLASS[size],
                className
              )}
            >
              {children}
              {dismissible && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-4 top-5"
                  onClick={() => onOpenChange(false)}
                  aria-label={t('common.close')}
                  title={t('common.close')}
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </m.div>
          </div>
        </DialogLayer>
      )}
    </AnimatePresence>,
    document.body
  );
};

interface DialogPartProps {
  children: React.ReactNode;
  className?: string;
}

const DialogHeader: React.FC<DialogPartProps> = ({ className, children }) => (
  <div
    className={cn(
      'flex shrink-0 flex-col gap-2 border-b border-ink px-6 pt-6 pb-4 pr-14 text-left',
      className
    )}
  >
    {children}
  </div>
);

const DialogBody: React.FC<DialogPartProps> = ({ className, children }) => (
  <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain p-6', className)}>
    {children}
  </div>
);

const DialogFooter: React.FC<DialogPartProps> = ({ className, children }) => (
  <div
    className={cn(
      'flex shrink-0 flex-row items-center justify-end gap-3 border-t border-ink bg-panel px-6 py-4',
      className
    )}
  >
    {children}
  </div>
);

const DialogTitle: React.FC<DialogPartProps> = ({ className, children }) => {
  const { titleId } = useDialogContext();
  return (
    <h2
      id={titleId}
      className={cn(
        'font-serif text-2xl font-bold uppercase leading-tight tracking-tight text-balance text-ink',
        className
      )}
    >
      {children}
    </h2>
  );
};

const DialogDescription: React.FC<DialogPartProps> = ({ className, children }) => (
  <p className={cn('text-sm text-ink-soft text-pretty', className)}>{children}</p>
);

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
