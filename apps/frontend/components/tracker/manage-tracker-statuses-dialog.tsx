'use client';

import React, { useMemo } from 'react';
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
import { useTranslations } from '@/lib/i18n';
import { APPLICATION_STATUS_ORDER, type ApplicationStatus } from '@/lib/api/tracker';

interface ManageTrackerStatusesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hiddenStatuses: readonly ApplicationStatus[];
  onHiddenStatusesChange: (hiddenStatuses: ApplicationStatus[]) => void;
}

export function ManageTrackerStatusesDialog({
  open,
  onOpenChange,
  hiddenStatuses,
  onHiddenStatusesChange,
}: ManageTrackerStatusesDialogProps) {
  const { t } = useTranslations();
  const hiddenStatusSet = useMemo(() => new Set(hiddenStatuses), [hiddenStatuses]);

  const setStatusVisible = (status: ApplicationStatus, visible: boolean) => {
    const nextHiddenStatuses = new Set(hiddenStatusSet);
    if (visible) nextHiddenStatuses.delete(status);
    else nextHiddenStatuses.add(status);

    onHiddenStatusesChange(
      APPLICATION_STATUS_ORDER.filter((candidate) => nextHiddenStatuses.has(candidate))
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="space-y-5 p-6">
          <DialogHeader className="pr-8">
            <DialogTitle>{t('tracker.manage.title')}</DialogTitle>
            <DialogDescription>{t('tracker.manage.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {APPLICATION_STATUS_ORDER.map((status) => (
              <ToggleSwitch
                key={status}
                checked={!hiddenStatusSet.has(status)}
                onCheckedChange={(visible) => setStatusVisible(status, visible)}
                label={t(`tracker.columns.${status}`)}
              />
            ))}
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('tracker.manage.done')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
