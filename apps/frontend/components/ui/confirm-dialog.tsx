'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2, XIcon, CheckCircle2 } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'warning' | 'default' | 'success';
  icon?: React.ReactNode;
  showCancelButton?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'default',
  icon,
  showCancelButton = true,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  // Map dialog variants to button variants and icon styles
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-red-100 border-red-300',
          iconColor: 'text-red-600',
          buttonVariant: 'destructive' as const,
          defaultIcon: <Trash2 className="w-6 h-6" />,
        };
      case 'warning':
        return {
          iconBg: 'bg-orange-100 border-orange-300',
          iconColor: 'text-orange-600',
          buttonVariant: 'warning' as const,
          defaultIcon: <AlertTriangle className="w-6 h-6" />,
        };
      case 'success':
        return {
          iconBg: 'bg-green-100 border-green-300',
          iconColor: 'text-green-700',
          buttonVariant: 'success' as const,
          defaultIcon: <CheckCircle2 className="w-6 h-6" />,
        };
      default:
        return {
          iconBg: 'bg-blue-100 border-blue-300',
          iconColor: 'text-blue-700',
          buttonVariant: 'default' as const,
          defaultIcon: <AlertTriangle className="w-6 h-6" />,
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-none">
        {/* Header with diagonal stripe pattern */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 opacity-5">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 10px,
                  currentColor 10px,
                  currentColor 11px
                )`,
              }}
            />
          </div>
          <DialogHeader className="p-6 pb-4 border-b border-black bg-white relative">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 border-2 ${styles.iconBg} ${styles.iconColor} flex items-center justify-center shrink-0`}
              >
                {icon || styles.defaultIcon}
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="font-serif text-xl font-bold uppercase tracking-tight text-left">
                  {title}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs text-gray-600 mt-2 text-left">
                  {description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Footer with actions */}
        <DialogFooter className="p-4 bg-[#F0F0E8] border-t border-black flex-row justify-end gap-3">
          {showCancelButton && (
            <DialogClose asChild>
              <Button variant="outline">
                <XIcon className="w-4 h-4" />
                {cancelLabel}
              </Button>
            </DialogClose>
          )}
          <Button variant={styles.buttonVariant} onClick={handleConfirm}>
            {variant === 'danger' && <Trash2 className="w-4 h-4" />}
            {variant === 'success' && <CheckCircle2 className="w-4 h-4" />}
            {variant === 'warning' && <AlertTriangle className="w-4 h-4" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
