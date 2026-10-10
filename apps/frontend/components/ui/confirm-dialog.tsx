'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog';
import { Alert } from './alert';
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
  cancelDisabled?: boolean;
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
  cancelDisabled = false,
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
    if (cancelDisabled) return;
    onCancel?.();
    onOpenChange(false);
  };

  const buttonVariant = (
    { danger: 'destructive', warning: 'warning', success: 'success', default: 'default' } as const
  )[variant];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && cancelDisabled) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="min-w-0 flex-1">
            <DialogDescription className="max-h-60 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
              {description}
            </DialogDescription>
          </div>
          {errorMessage && (
            <Alert
              tone="error"
              className="max-h-60 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]"
            >
              {errorMessage}
            </Alert>
          )}
        </DialogBody>
        <DialogFooter>
          {showCancelButton && (
            <Button variant="outline" onClick={handleCancel} disabled={cancelDisabled}>
              {finalCancelLabel}
            </Button>
          )}
          <Button variant={buttonVariant} onClick={handleConfirm} disabled={confirmDisabled}>
            {finalConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
