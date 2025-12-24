'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { XIcon } from 'lucide-react';

const DialogContext = React.createContext<{
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
} | null>(null);

function useDialog() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a Dialog');
  }
  return context;
}

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [isOpenState, setIsOpenState] = React.useState(false);
  const isOpen = open !== undefined ? open : isOpenState;
  const setIsOpen = onOpenChange || setIsOpenState;

  return <DialogContext.Provider value={{ isOpen, setIsOpen }}>{children}</DialogContext.Provider>;
}

export function DialogTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const { setIsOpen } = useDialog();

  const handleClick = () => {
    setIsOpen(true);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement, { onClick: handleClick });
  }

  return <button onClick={handleClick}>{children}</button>;
}

export function DialogContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { isOpen, setIsOpen } = useDialog();
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
      document.body.style.overflow = 'hidden';
    } else {
      dialogRef.current?.close();
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
  };

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === dialogRef.current) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        'fixed inset-0 z-50 w-full max-w-lg p-0 backdrop:bg-black/50 open:animate-in open:fade-in-0 open:zoom-in-95 backdrop:backdrop-blur-sm bg-transparent border-none shadow-none m-auto',
        // Native dialog styling resets
        'block'
      )}
      onClick={handleBackdropClick}
      onCancel={handleClose}
    >
      <div
        className={cn(
          'relative bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] flex flex-col w-full',
          className
        )}
      >
        {children}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
        >
          <XIcon className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </dialog>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function DialogClose({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const { setIsOpen } = useDialog();
  const handleClick = () => setIsOpen(false);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement, { onClick: handleClick });
  }
  return <button onClick={handleClick}>{children}</button>;
}
