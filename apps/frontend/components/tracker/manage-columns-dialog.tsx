'use client';

import React, { useState } from 'react';
import ArrowDown from 'lucide-react/dist/esm/icons/arrow-down';
import ArrowUp from 'lucide-react/dist/esm/icons/arrow-up';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
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
import { Input } from '@/components/ui/input';
import { Dropdown } from '@/components/ui/dropdown';
import {
  createTrackerColumn,
  deleteTrackerColumn,
  updateTrackerColumn,
  type TrackerColumn,
} from '@/lib/api/tracker';

interface ManageColumnsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: TrackerColumn[];
  onToggle: (column: TrackerColumn) => Promise<void>;
  onChanged: () => Promise<void>;
}

export function ManageColumnsDialog({
  open,
  onOpenChange,
  columns,
  onToggle,
  onChanged,
}: ManageColumnsDialogProps) {
  const { t } = useTranslations();
  const [newLabel, setNewLabel] = useState('');
  const [destination, setDestination] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const save = async (operation: () => Promise<unknown>) => {
    try {
      setError(null);
      await operation();
      await onChanged();
    } catch {
      setError(t('tracker.manageDialog.saveFailed'));
    }
  };

  const addColumn = async () => {
    if (!newLabel.trim()) return;
    await save(async () => {
      await createTrackerColumn(newLabel.trim());
      setNewLabel('');
    });
  };

  const moveColumn = (column: TrackerColumn, direction: -1 | 1) => {
    const nextPosition = column.position + direction;
    if (nextPosition < 0 || nextPosition >= columns.length) return;
    void save(() => updateTrackerColumn(column.column_id, { position: nextPosition }));
  };

  const deleteColumn = (column: TrackerColumn) => {
    const destinationId = destination[column.column_id];
    if (!destinationId) return;
    void save(() => deleteTrackerColumn(column.column_id, destinationId));
  };

  const displayLabel = (column: TrackerColumn): string =>
    column.is_system ? t(`tracker.columns.${column.column_id}`) : column.label;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-6">
        <DialogHeader>
          <DialogTitle>{t('tracker.manageDialog.title')}</DialogTitle>
          <DialogDescription>{t('tracker.manageDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 py-4">
          <Input
            aria-label={t('tracker.manageDialog.newColumn')}
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder={t('tracker.manageDialog.newColumnPlaceholder')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addColumn();
            }}
          />
          <Button onClick={() => void addColumn()} disabled={!newLabel.trim()}>
            <Plus className="h-4 w-4" />
            {t('tracker.manageDialog.add')}
          </Button>
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {columns.map((column, index) => {
            const destinations = columns
              .filter((candidate) => candidate.column_id !== column.column_id)
              .map((candidate) => ({ id: candidate.column_id, label: displayLabel(candidate) }));
            return (
              <div key={column.column_id} className="border border-black bg-background p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {column.is_system ? (
                      <span className="font-mono text-sm font-bold uppercase">
                        {displayLabel(column)}
                      </span>
                    ) : (
                      <Input
                        aria-label={column.label}
                        defaultValue={column.label}
                        onBlur={(event) => {
                          if (
                            event.target.value.trim() &&
                            event.target.value.trim() !== column.label
                          ) {
                            void save(() =>
                              updateTrackerColumn(column.column_id, {
                                label: event.target.value.trim(),
                              })
                            );
                          }
                        }}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={t('tracker.manageDialog.moveUp')}
                    disabled={index === 0}
                    onClick={() => moveColumn(column, -1)}
                    className="border border-black p-2 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('tracker.manageDialog.moveDown')}
                    disabled={index === columns.length - 1}
                    onClick={() => moveColumn(column, 1)}
                    className="border border-black p-2 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void save(() => onToggle(column))}
                    disabled={
                      !column.is_hidden && columns.filter((item) => !item.is_hidden).length <= 1
                    }
                  >
                    {column.is_hidden
                      ? t('tracker.manageDialog.show')
                      : t('tracker.manageDialog.hide')}
                  </Button>
                </div>
                {!column.is_system && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1">
                      <Dropdown
                        options={[
                          { id: '', label: t('tracker.manageDialog.moveCardsTo') },
                          ...destinations,
                        ]}
                        value={destination[column.column_id] ?? ''}
                        onChange={(value) =>
                          setDestination((current) => ({ ...current, [column.column_id]: value }))
                        }
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!destination[column.column_id]}
                      onClick={() => deleteColumn(column)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('common.delete')}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {error && <p className="pt-3 font-mono text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('tracker.manageDialog.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
