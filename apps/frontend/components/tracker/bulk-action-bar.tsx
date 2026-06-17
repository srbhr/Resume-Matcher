'use client';

import React, { useState } from 'react';
import X from 'lucide-react/dist/esm/icons/x';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslations } from '@/lib/i18n';
import { APPLICATION_STATUS_ORDER, type ApplicationStatus } from '@/lib/api/tracker';

interface BulkActionBarProps {
  selectedCount: number;
  onMove: (status: ApplicationStatus) => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar({ selectedCount, onMove, onDelete, onClear }: BulkActionBarProps) {
  const { t } = useTranslations();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const moveOptions = [
    { id: '', label: t('tracker.bulk.moveTo') },
    ...APPLICATION_STATUS_ORDER.map((status) => ({
      id: status,
      label: t(`tracker.columns.${status}`),
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 border border-black bg-background p-3 shadow-sw-sm">
      <span className="font-mono text-sm font-bold text-ink">
        {t('tracker.bulk.selected', { count: String(selectedCount) })}
      </span>

      <div className="w-48">
        <Dropdown
          options={moveOptions}
          value=""
          onChange={(value) => {
            if (value) onMove(value as ApplicationStatus);
          }}
        />
      </div>

      <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
        <Trash2 className="h-4 w-4" />
        {t('common.delete')}
      </Button>

      <Button variant="ghost" size="sm" onClick={onClear}>
        <X className="h-4 w-4" />
        {t('tracker.bulk.clear')}
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('tracker.bulk.deleteConfirmTitle')}
        description={t('tracker.bulk.deleteConfirmDescription', { count: String(selectedCount) })}
        confirmLabel={t('common.delete')}
        variant="warning"
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
      />
    </div>
  );
}
