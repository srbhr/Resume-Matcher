'use client';

import React, { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

import { Copy, Plus, Trash } from '@phosphor-icons/react';
import type { CustomSectionItem } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';
import { SortableItemList } from '../sortable-item-list';
import { DescriptionPointsEditor, type DescriptionPatch } from './description-points-editor';
import { duplicateById } from '@/lib/utils/reorder-items';

interface GenericItemFormProps {
  /** Section key, used to build a unique DndContext id per custom section. */
  sectionKey: string;
  items: CustomSectionItem[];
  onChange: (items: CustomSectionItem[]) => void;
  itemLabel?: string;
  addLabel?: string;
  showSubtitle?: boolean;
  showLocation?: boolean;
  showYears?: boolean;
  titlePlaceholder?: string;
  subtitlePlaceholder?: string;
  locationPlaceholder?: string;
  yearsPlaceholder?: string;
  descriptionPlaceholder?: string;
}

/**
 * Generic Item Form Component
 *
 * Used for ITEM_LIST type sections (like Experience, Education, Projects).
 * Renders a list of items with configurable fields.
 */
export const GenericItemForm: React.FC<GenericItemFormProps> = ({
  sectionKey,
  items,
  onChange,
  itemLabel,
  addLabel,
  showSubtitle = true,
  showLocation = true,
  showYears = true,
  titlePlaceholder,
  subtitlePlaceholder,
  locationPlaceholder,
  yearsPlaceholder,
  descriptionPlaceholder,
}) => {
  const { t } = useTranslations();
  const fieldId = useId();

  const finalItemLabel = itemLabel ?? t('builder.genericItemForm.itemLabel');
  const finalAddLabel =
    addLabel ?? t('builder.genericItemForm.addItemLabel', { label: finalItemLabel });

  const finalTitlePlaceholder = titlePlaceholder ?? t('builder.genericItemForm.placeholders.title');
  const finalSubtitlePlaceholder =
    subtitlePlaceholder ?? t('builder.genericItemForm.placeholders.organization');
  const finalLocationPlaceholder =
    locationPlaceholder ?? t('builder.genericItemForm.placeholders.location');
  const finalYearsPlaceholder = yearsPlaceholder ?? t('builder.genericItemForm.placeholders.years');
  const finalDescriptionPlaceholder =
    descriptionPlaceholder ?? t('builder.genericItemForm.placeholders.description');

  const handleAdd = () => {
    const newId = Math.max(...items.map((d) => d.id), 0) + 1;
    onChange([
      ...items,
      {
        id: newId,
        title: '',
        subtitle: '',
        location: '',
        years: '',
        description: [''],
        descriptionStyles: ['bullet'],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: keyof CustomSectionItem, value: string | string[]) => {
    onChange(
      items.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const handleDescriptionPatch = (id: number, patch: DescriptionPatch) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleAdd}>
          <Plus aria-hidden="true" />
          {finalAddLabel}
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          variant="framed"
          title={t('builder.genericItemForm.noEntries', { label: finalItemLabel })}
          action={
            <Button variant="outline" size="sm" onClick={handleAdd}>
              <Plus aria-hidden="true" />
              {t('builder.genericItemForm.addFirstItem', { label: finalItemLabel })}
            </Button>
          }
        />
      ) : (
        <SortableItemList
          id={`custom-${sectionKey}-items`}
          items={items}
          onReorder={onChange}
          animateItems
        >
          {(item) => (
            <div className="p-6 border border-ink bg-paper relative group">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-16 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-steel hover:text-ink-soft"
                onClick={() => onChange(duplicateById(items, item.id))}
                aria-label={t('a11y.duplicateItem')}
                title={t('a11y.duplicateItem')}
              >
                <Copy aria-hidden="true" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive-tint"
                onClick={() => handleRemove(item.id)}
                aria-label={t('a11y.removeItem')}
                title={t('a11y.removeItem')}
              >
                <Trash aria-hidden="true" />
              </Button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pr-24">
                <div className="space-y-2">
                  <Label htmlFor={`${fieldId}-${item.id}-title`}>
                    {t('builder.genericItemForm.fields.title')}
                  </Label>
                  <Input
                    id={`${fieldId}-${item.id}-title`}
                    value={item.title || ''}
                    onChange={(e) => handleChange(item.id, 'title', e.target.value)}
                    placeholder={finalTitlePlaceholder}
                  />
                </div>
                {showSubtitle && (
                  <div className="space-y-2">
                    <Label htmlFor={`${fieldId}-${item.id}-subtitle`}>
                      {t('builder.genericItemForm.fields.organization')}
                    </Label>
                    <Input
                      id={`${fieldId}-${item.id}-subtitle`}
                      value={item.subtitle || ''}
                      onChange={(e) => handleChange(item.id, 'subtitle', e.target.value)}
                      placeholder={finalSubtitlePlaceholder}
                    />
                  </div>
                )}
                {showLocation && (
                  <div className="space-y-2">
                    <Label htmlFor={`${fieldId}-${item.id}-location`}>
                      {t('builder.genericItemForm.fields.location')}
                    </Label>
                    <Input
                      id={`${fieldId}-${item.id}-location`}
                      value={item.location || ''}
                      onChange={(e) => handleChange(item.id, 'location', e.target.value)}
                      placeholder={finalLocationPlaceholder}
                    />
                  </div>
                )}
                {showYears && (
                  <div className="space-y-2">
                    <Label htmlFor={`${fieldId}-${item.id}-years`}>
                      {t('builder.genericItemForm.fields.years')}
                    </Label>
                    <Input
                      id={`${fieldId}-${item.id}-years`}
                      value={item.years || ''}
                      onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                      placeholder={finalYearsPlaceholder}
                    />
                  </div>
                )}
              </div>

              <DescriptionPointsEditor
                id={`custom-${sectionKey}-${item.id}-points`}
                description={item.description}
                descriptionStyles={item.descriptionStyles}
                placeholder={finalDescriptionPlaceholder}
                onChange={(patch) => handleDescriptionPatch(item.id, patch)}
              />
            </div>
          )}
        </SortableItemList>
      )}
    </div>
  );
};
