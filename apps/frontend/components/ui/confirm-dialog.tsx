'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog';
import { Button } from './button';
import { useTranslations } from '@/lib/i18n';

/**
 * Swiss International Style Confirm Dialog Component
 *
 * A modal dialog for confirming user actions with semantic variants:
 * - danger: Destructive actions (delete, remove)
 * - warning: Caution actions (reset, overwrite)
 * - success: Positive confirmations
 * - default: Neutral confirmations
 */

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  errorMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  variant?: 'danger' | 'warning' | 'success' | 'default';
  closeOnConfirm?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  showCancelButton?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  errorMessage,
  confirmLabel,
  cancelLabel,
  confirmDisabled = false,
  variant = 'default',
  closeOnConfirm = true,
  onConfirm,
  onCancel,
  showCancelButton = true,
}) => {
  const { t } = useTranslations();
  const finalConfirmLabel = confirmLabel ?? t('common.confirm');
  const finalCancelLabel = cancelLabel ?? t('common.cancel');

  const handleConfirm = () => {
    if (confirmDisabled) return;
    onConfirm();
    if (closeOnConfirm) {
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const variantStyles = {
    danger: {
      icon: (
        <div className="w-12 h-12 border-2 border-red-600 bg-red-50 flex items-center justify-center">
          <span className="text-red-600 text-2xl font-bold">!</span>
        </div>
      ),
      buttonVariant: 'destructive' as const,
    },
    warning: {
      icon: (
        <div className="w-12 h-12 border-2 border-orange-500 bg-orange-50 flex items-center justify-center">
          <span className="text-orange-500 text-2xl font-bold">!</span>
        </div>
      ),
      buttonVariant: 'warning' as const,
    },
    success: {
      icon: (
        <div className="w-12 h-12 border-2 border-green-700 bg-green-50 flex items-center justify-center">
          <span className="text-green-700 text-2xl font-bold">&#10003;</span>
        </div>
      ),
      buttonVariant: 'success' as const,
    },
    default: {
      icon: (
        <div className="w-12 h-12 border-2 border-blue-700 bg-blue-50 flex items-center justify-center">
          <span className="text-blue-700 text-2xl font-bold">?</span>
        </div>
      ),
      buttonVariant: 'default' as const,
    },
  };

  const { icon, buttonVariant } = variantStyles[variant];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] p-0 gap-0">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-start gap-4">
            {icon}
            <div className="flex-1">
              <DialogTitle className="font-serif text-xl font-bold uppercase tracking-tight">
                {title}
              </DialogTitle>
              <DialogDescription className="font-mono text-xs text-gray-600 mt-2">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {errorMessage && (
          <div className="px-6 pb-4">
            <div className="border-2 border-red-600 bg-red-50 p-3 font-mono text-xs text-red-700">
              {errorMessage}
            </div>
          </div>
        )}
        <DialogFooter className="p-4 bg-[#E5E5E0] border-t border-black flex-row justify-end gap-3">
          {showCancelButton && (
            <Button variant="outline" onClick={handleCancel} className="rounded-none border-black">
              {finalCancelLabel}
            </Button>
          )}
          <Button
            variant={buttonVariant}
            onClick={handleConfirm}
            className="rounded-none"
            disabled={confirmDisabled}
          >
            {finalConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
