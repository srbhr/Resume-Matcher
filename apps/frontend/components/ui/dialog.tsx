'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { AnimatePresence, m, useIsPresent, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { isImeComposing } from '@/lib/utils/keyboard';
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
 * The dialog element itself, mounted while AnimatePresence plays its exit. By then it
 * is closed (no longer modal), but its subtree still has live handlers (a second click
 * on a confirm button would fire it again), so it is inert and click-through.
 */
const DialogPanel = React.forwardRef<HTMLDialogElement, React.ComponentProps<typeof m.dialog>>(
  ({ className, ...props }, ref) => {
    const isPresent = useIsPresent();
    return (
      <m.dialog
        ref={ref}
        className={cn(className, !isPresent && 'pointer-events-none')}
        inert={!isPresent}
        {...props}
      />
    );
  }
);
DialogPanel.displayName = 'DialogPanel';

// Open dialogs, bottom to top. Escape closes only the top one, and the body scroll lock
// is released only when the last one closes.
const openDialogs: symbol[] = [];
let bodyLocks = 0;
// One keypress closes one dialog. A browser can flush React between two keydown listeners,
// which would make the dialog underneath the new top before its own listener runs.
const handledEscapes = new WeakSet<Event>();

/** Whether a pointer event lands outside the element's box: on its ::backdrop. */
const isOutside = (e: React.MouseEvent<HTMLElement>) => {
  const box = e.currentTarget.getBoundingClientRect();
  return (
    e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom
  );
};

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
  size?: DialogSize;
  /** Element to focus on open. Defaults to the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * A native modal `<dialog>`: the browser puts it in the top layer and makes the page
 * behind it inert. React still owns whether it is open: Escape and outside clicks go
 * through `onOpenChange`, never the browser's own close.
 */
const DialogContent: React.FC<DialogContentProps> = ({
  children,
  className,
  size = 'md',
  initialFocusRef,
}) => {
  const { open, onOpenChange, dismissible, titleId } = useDialogContext();
  const { t } = useTranslations();
  const panelRef = React.useRef<HTMLDialogElement>(null);
  const pressStartedOutside = React.useRef(false);
  // Read by the native `close` listener, which can fire after a render.
  const openRef = React.useRef(open);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);
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
      if (e.key !== 'Escape' || !open || openDialogs[openDialogs.length - 1] !== idRef.current) {
        return;
      }
      // The browser's own Escape would close the dialog behind React's back.
      e.preventDefault();
      // An Escape that cancels an IME candidate belongs to the text being typed.
      if (isImeComposing(e)) return;
      if (dismissible && !handledEscapes.has(e)) {
        handledEscapes.add(e);
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, dismissible, onOpenChange]);

  // Open and focus contract: record the opener, open as a modal, move focus in; on close,
  // close the element and give focus back to the opener. Don't use autoFocus inside a
  // dialog: React applies it before this effect runs, so the opener is never recorded.
  // On close, the opener only gets focus back if nothing else claimed it (a close
  // handler may have focused something on purpose, e.g. the editor behind a link dialog).
  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusWasInside = Boolean(panel?.contains(document.activeElement));
    // Guarded: development StrictMode runs this effect twice, and showModal() throws on an
    // open dialog.
    if (panel && !panel.open) panel.showModal();
    if (panel && !focusWasInside) {
      (initialFocusRef?.current ?? focusableIn(panel)[0] ?? panel).focus();
    }
    return () => {
      // Close first: while it is modal, the page behind (the opener too) can't take focus.
      if (panel?.open) panel.close();
      const active = document.activeElement;
      if (!active || active === document.body || panel?.contains(active)) opener?.focus();
    };
  }, [open, initialFocusRef]);

  const trapTab = (e: React.KeyboardEvent<HTMLDialogElement>) => {
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
        <DialogPanel
          key="dialog"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={trapTab}
          onCancel={(e) => e.preventDefault()}
          onClose={() => {
            // Closed by the browser while React still has it open (a browser may let a
            // repeated Escape through a prevented cancel): honour the forced choice.
            const panel = panelRef.current;
            if (!openRef.current || !panel || panel.open) return;
            if (dismissible) onOpenChange(false);
            else panel.showModal();
          }}
          onPointerDown={(e) => {
            pressStartedOutside.current = e.target === e.currentTarget && isOutside(e);
          }}
          onClick={(e) => {
            // A click on the backdrop targets the dialog itself, outside its box. A press
            // that starts in the panel (selecting text) and ends out there doesn't count.
            if (
              e.target === e.currentTarget &&
              isOutside(e) &&
              pressStartedOutside.current &&
              dismissible
            ) {
              onOpenChange(false);
            }
            e.stopPropagation();
          }}
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
            // Shown while it exits too, when it is no longer open: hence an explicit
            // display, fixed centring and z-index instead of the modal defaults.
            'fixed inset-0 z-50 m-auto flex h-fit max-h-[90vh] w-[calc(100%-2rem)] flex-col overflow-hidden p-0',
            'rounded-none border border-ink bg-white text-inherit shadow-sw-lg outline-none',
            'backdrop:bg-overlay',
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
        </DialogPanel>
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
