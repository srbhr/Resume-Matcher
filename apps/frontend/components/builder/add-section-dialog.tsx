'use client';

import React, { useId, useState } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Plus } from '@phosphor-icons/react';
import type { SectionType } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (displayName: string, sectionType: SectionType) => void;
}

type SelectableSectionType = Exclude<SectionType, 'personalInfo'>;

/**
 * AddSectionDialog Component
 *
 * Dialog for creating new custom sections.
 * Allows user to enter a name and select a section type.
 */
export const AddSectionDialog: React.FC<AddSectionDialogProps> = ({
  open,
  onOpenChange,
  onAdd,
}) => {
  const { t } = useTranslations();
  const [displayName, setDisplayName] = useState('');
  const [sectionType, setSectionType] = useState<SelectableSectionType>('text');
  const fieldId = useId();

  const handleSubmit = () => {
    if (displayName.trim()) {
      onAdd(displayName.trim(), sectionType);
      setDisplayName('');
      setSectionType('text');
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && displayName.trim()) {
      handleSubmit();
    }
  };

  const sectionTypes: {
    type: SelectableSectionType;
    label: string;
    description: string;
  }[] = [
    {
      type: 'text',
      label: t('builder.customSections.sectionTypes.textBlockLabel'),
      description: t('builder.customSections.sectionTypes.textBlockDescription'),
    },
    {
      type: 'itemList',
      label: t('builder.customSections.sectionTypes.itemListLabel'),
      description: t('builder.customSections.sectionTypes.itemListDescription'),
    },
    {
      type: 'stringList',
      label: t('builder.customSections.sectionTypes.stringListLabel'),
      description: t('builder.customSections.sectionTypes.stringListDescription'),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('builder.customSections.dialogTitle')}</DialogTitle>
          <DialogDescription className="font-mono text-xs text-ink-soft">
            {t('builder.customSections.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {/* Section Name */}
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-name`} className="block">
              {t('builder.customSections.sectionNameLabel')}
            </Label>
            <Input
              id={`${fieldId}-name`}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('builder.customSections.sectionNamePlaceholder')}
            />
          </div>

          {/* Section Type */}
          <div className="space-y-3">
            <Label id={`${fieldId}-type`} className="block">
              {t('builder.customSections.sectionTypeLabel')}
            </Label>
            <SegmentedControl
              variant="outline"
              aria-labelledby={`${fieldId}-type`}
              className="grid grid-cols-1 gap-2"
              value={sectionType}
              onChange={setSectionType}
              items={sectionTypes.map((item) => ({
                value: item.type,
                label: (
                  <span className="flex flex-col items-start gap-1 text-left normal-case tracking-normal">
                    <span className="font-sans text-sm font-medium">{item.label}</span>
                    <span className="font-mono text-xs text-ink-soft">{item.description}</span>
                  </span>
                ),
              }))}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t('common.cancel')}</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!displayName.trim()}>
            <Plus aria-hidden="true" />
            {t('builder.addSection')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * AddSectionButton Component
 *
 * Button that triggers the AddSectionDialog.
 */
interface AddSectionButtonProps {
  onAdd: (displayName: string, sectionType: SectionType) => void;
}

export const AddSectionButton: React.FC<AddSectionButtonProps> = ({ onAdd }) => {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="w-full border-2 py-6">
        <Plus aria-hidden="true" className="size-5" />
        {t('builder.customSections.addCustomSectionButton')}
      </Button>
      <AddSectionDialog open={open} onOpenChange={setOpen} onAdd={onAdd} />
    </>
  );
};
