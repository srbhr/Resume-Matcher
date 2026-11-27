'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { labelClass } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { TextAlignLeft, ListBullets, Plus, Trash } from '@phosphor-icons/react';
import { useTranslations } from '@/lib/i18n';
import {
  alignDescriptionStyles,
  fromDescriptionRows,
  toDescriptionRows,
  toggleDescriptionStyle,
  type DescriptionStyle,
} from '@/lib/utils/description-styles';
import { SortableItemList } from '../sortable-item-list';

// Lazy-load TipTap-based editor — keeps it out of the initial bundle.
// Loads only when an entry is actually being edited.
const RichTextEditor = dynamic(
  () => import('@/components/ui/rich-text-editor').then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      // The editor's own box while it loads: a toolbar band over the text area.
      <div className="border border-ink bg-white" aria-busy="true">
        <div className="border-b border-ink bg-panel p-1">
          <div className="h-8" />
        </div>
        <div className="min-h-[60px]" />
      </div>
    ),
  }
);

export interface DescriptionPatch {
  description?: string[];
  descriptionStyles?: DescriptionStyle[];
}

interface DescriptionPointsEditorProps {
  /** Id of the sortable list of points; unique per entry. */
  id: string;
  description?: string[];
  descriptionStyles?: DescriptionStyle[];
  placeholder: string;
  onChange: (patch: DescriptionPatch) => void;
}

/**
 * Editable, reorderable description points of one entry (experience,
 * project or custom item), each a bullet or a plain line.
 */
export const DescriptionPointsEditor: React.FC<DescriptionPointsEditorProps> = ({
  id,
  description,
  descriptionStyles,
  placeholder,
  onChange,
}) => {
  const { t } = useTranslations();

  const handleDescriptionChange = (index: number, value: string) => {
    const newDesc = [...(description || [])];
    newDesc[index] = value;
    onChange({ description: newDesc });
  };

  const handleAddDescription = () => {
    onChange({
      description: [...(description || []), ''],
      descriptionStyles: [...(descriptionStyles || []), 'bullet'],
    });
  };

  const handleToggleDescriptionStyle = (index: number) => {
    onChange({
      descriptionStyles: toggleDescriptionStyle(description, descriptionStyles, index),
    });
  };

  const handleRemoveDescription = (index: number) => {
    const newDesc = [...(description || [])];
    newDesc.splice(index, 1);
    const newStyles = alignDescriptionStyles(description, descriptionStyles);
    newStyles.splice(index, 1);
    onChange({ description: newDesc, descriptionStyles: newStyles });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className={labelClass}>{t('builder.genericItemForm.fields.descriptionPoints')}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAddDescription}
          className="h-6 text-xs text-primary hover:text-primary-hover hover:bg-info-tint"
        >
          <Plus aria-hidden="true" />
          {t('builder.genericItemForm.actions.addPoint')}
        </Button>
      </div>
      {description?.length ? (
        <SortableItemList
          id={id}
          items={toDescriptionRows(description, descriptionStyles)}
          onReorder={(rows) => onChange(fromDescriptionRows(rows))}
          className="space-y-3"
          handleLabel={t('builder.genericItemForm.actions.reorderPoint')}
        >
          {({ text: desc, style }, idx) => (
            <div className="relative">
              <RichTextEditor
                value={desc}
                onChange={(html) => handleDescriptionChange(idx, html)}
                placeholder={placeholder}
                minHeight="60px"
              />
              {/* The point's own controls, at the right end of the editor's toolbar band
                  (its p-1 inside the 1px border puts them on the toolbar's row). */}
              <div className="absolute right-1 top-1 flex gap-3">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleToggleDescriptionStyle(idx)}
                  className="text-ink-soft hover:bg-panel-hover hover:text-ink"
                  aria-label={t('builder.genericItemForm.actions.togglePointStyle')}
                  title={t('builder.genericItemForm.actions.togglePointStyle')}
                >
                  {style === 'plain' ? (
                    <TextAlignLeft aria-hidden="true" />
                  ) : (
                    <ListBullets aria-hidden="true" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveDescription(idx)}
                  className="text-ink-soft hover:bg-destructive-tint hover:text-destructive"
                  aria-label={t('a11y.removeDescription')}
                  title={t('a11y.removeDescription')}
                >
                  <Trash aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </SortableItemList>
      ) : null}
    </div>
  );
};
