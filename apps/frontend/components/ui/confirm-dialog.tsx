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
import { AlertTriangle, Trash2, XIcon } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'warning' | 'default';
  icon?: React.ReactNode;
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
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-red-100 border-red-300',
          iconColor: 'text-red-600',
          confirmButton: 'bg-red-600 hover:bg-red-700 text-white border-red-700',
          defaultIcon: <Trash2 className="w-6 h-6" />,
        };
      case 'warning':
        return {
          iconBg: 'bg-orange-100 border-orange-300',
          iconColor: 'text-orange-600',
          confirmButton: 'bg-orange-600 hover:bg-orange-700 text-white border-orange-700',
          defaultIcon: <AlertTriangle className="w-6 h-6" />,
        };
      default:
        return {
          iconBg: 'bg-blue-100 border-blue-300',
          iconColor: 'text-blue-700',
          confirmButton: 'bg-blue-700 hover:bg-blue-800 text-white border-blue-800',
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
          <DialogClose asChild>
            <Button
              variant="outline"
              className="rounded-none border-black hover:bg-white shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
            >
              <XIcon className="w-4 h-4 mr-2" />
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            onClick={handleConfirm}
            className={`rounded-none border shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all ${styles.confirmButton}`}
          >
            {variant === 'danger' && <Trash2 className="w-4 h-4 mr-2" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
