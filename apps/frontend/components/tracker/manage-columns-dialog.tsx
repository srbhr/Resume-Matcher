'use client';

import React from 'react';
import { APPLICATION_STATUS_ORDER, type ApplicationStatus } from '@/lib/api/tracker';
import { useTranslations } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { isLastVisibleStatus } from '@/lib/utils/tracker-column-visibility';

interface ManageColumnsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hiddenStatuses: Set<ApplicationStatus>;
  onToggle: (status: ApplicationStatus) => void;
}

export function ManageColumnsDialog({
  open,
  onOpenChange,
  hiddenStatuses,
  onToggle,
}: ManageColumnsDialogProps) {
  const { t } = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>{t('tracker.manageDialog.title')}</DialogTitle>
          <DialogDescription>{t('tracker.manageDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto py-4">
          {APPLICATION_STATUS_ORDER.map((status) => {
            const hidden = hiddenStatuses.has(status);
            // The last stage on the board is locked: hiding it would leave a
            // blank canvas reachable only through this dialog.
            const lastVisible = isLastVisibleStatus(hiddenStatuses, status);
            return (
              <div key={status}>
                <ToggleSwitch
                  checked={!hidden}
                  onCheckedChange={() => onToggle(status)}
                  label={t(`tracker.columns.${status}`)}
                  // State label, not an action: the switch position already
                  // carries the action.
                  description={
                    hidden ? t('tracker.manageDialog.hidden') : t('tracker.manageDialog.visible')
                  }
                  disabled={lastVisible}
                />
                {lastVisible && (
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                    {t('tracker.manageDialog.lastVisibleHint')}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('tracker.manageDialog.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
