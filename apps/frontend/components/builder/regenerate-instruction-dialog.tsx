'use client';

import React from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { ArrowLeft, SpinnerGap } from '@phosphor-icons/react';
import { useTranslations } from '@/lib/i18n';
import type { RegenerateItemInput } from '@/lib/api/enrichment';

interface RegenerateInstructionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItems: RegenerateItemInput[];
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  error: string | null;
  onBack: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

/**
 * RegenerateInstructionDialog Component
 *
 * Second step of the regenerate wizard.
 * Shows selected items and allows user to input improvement instructions.
 * Swiss International Style design.
 */
export const RegenerateInstructionDialog: React.FC<RegenerateInstructionDialogProps> = ({
  open,
  onOpenChange,
  selectedItems,
  instruction,
  onInstructionChange,
  error,
  onBack,
  onGenerate,
  isGenerating,
}) => {
  const { t } = useTranslations();

  const resolveErrorMessage = (value: string) => {
    if (value === 'No items selected') {
      return t('builder.regenerate.selectDialog.noItemsSelected');
    }

    if (/network|fetch/i.test(value) || value.includes('Failed to fetch')) {
      return t('builder.regenerate.errors.networkError');
    }

    return t('builder.regenerate.errors.generationFailed');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow Enter key in textarea without closing dialog
    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('builder.regenerate.instructionDialog.title')}</DialogTitle>
          <DialogDescription className="font-mono text-xs text-ink-soft">
            {t('builder.regenerate.instructionDialog.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {error ? <Alert tone="error">{resolveErrorMessage(error)}</Alert> : null}
          {/* Selected Items Summary */}
          <div className="space-y-2">
            <Label id="regenerate-selected-items" className="block">
              {t('builder.regenerate.instructionDialog.selectedItems')}
            </Label>
            <ul
              aria-labelledby="regenerate-selected-items"
              className="bg-paper border border-steel p-3 space-y-2 max-h-32 overflow-y-auto"
            >
              {selectedItems.map((item) => (
                <li key={item.item_id} className="flex items-center gap-2 text-sm">
                  <span className="font-medium truncate">{item.title}</span>
                  {item.subtitle && (
                    <span className="text-steel text-xs truncate">| {item.subtitle}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Instruction Input */}
          <div className="space-y-2">
            <Label htmlFor="regenerate-instruction" className="block">
              {t('builder.regenerate.instructionDialog.hint')}
            </Label>
            <Textarea
              id="regenerate-instruction"
              value={instruction}
              onChange={(e) => onInstructionChange(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={2000}
              placeholder={t('builder.regenerate.instructionDialog.placeholder')}
              className="min-h-[120px]"
              disabled={isGenerating}
            />
          </div>
        </DialogBody>

        <DialogFooter className="justify-between">
          <Button variant="outline" onClick={onBack} disabled={isGenerating}>
            <ArrowLeft aria-hidden="true" />
            {t('builder.regenerate.instructionDialog.backButton')}
          </Button>
          <Button onClick={onGenerate} disabled={isGenerating}>
            {isGenerating && <SpinnerGap className="size-4 animate-spin" aria-hidden="true" />}
            {isGenerating
              ? t('builder.regenerate.diffPreview.loading')
              : t('builder.regenerate.instructionDialog.generateButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RegenerateInstructionDialog;
