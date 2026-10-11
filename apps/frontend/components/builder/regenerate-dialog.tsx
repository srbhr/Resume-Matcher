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
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Check, CaretDown, CaretRight } from '@phosphor-icons/react';
import { useTranslations } from '@/lib/i18n';
import type { RegenerateItemInput } from '@/lib/api/enrichment';

interface RegenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  experienceItems: RegenerateItemInput[];
  projectItems: RegenerateItemInput[];
  skillsItem: RegenerateItemInput | null;
  selectedItems: RegenerateItemInput[];
  onSelectionChange: (items: RegenerateItemInput[]) => void;
  onContinue: () => void;
}

/**
 * RegenerateDialog Component
 *
 * First step of the regenerate wizard.
 * Allows user to select which resume items to regenerate.
 * Swiss International Style design.
 */
export const RegenerateDialog: React.FC<RegenerateDialogProps> = ({
  open,
  onOpenChange,
  experienceItems,
  projectItems,
  skillsItem,
  selectedItems,
  onSelectionChange,
  onContinue,
}) => {
  const { t } = useTranslations();
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
    new Set(['experience', 'projects', 'skills'])
  );

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const isSelected = (item: RegenerateItemInput) => {
    return selectedItems.some((s) => s.item_id === item.item_id);
  };

  const toggleItem = (item: RegenerateItemInput) => {
    if (isSelected(item)) {
      onSelectionChange(selectedItems.filter((s) => s.item_id !== item.item_id));
    } else {
      onSelectionChange([...selectedItems, item]);
    }
  };

  const hasItems = experienceItems.length > 0 || projectItems.length > 0 || skillsItem !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('builder.regenerate.selectDialog.title')}</DialogTitle>
          <DialogDescription className="font-mono text-xs text-ink-soft">
            {t('builder.regenerate.selectDialog.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {!hasItems && (
            <EmptyState title={t('builder.regenerate.selectDialog.noItemsAvailable')} />
          )}

          {/* Experience Section */}
          {experienceItems.length > 0 && (
            <div className="border border-ink">
              <button
                type="button"
                onClick={() => toggleSection('experience')}
                aria-expanded={expandedSections.has('experience')}
                className="w-full p-4 flex items-center justify-between bg-canvas hover:bg-panel transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm uppercase tracking-wider font-medium">
                    {t('builder.regenerate.selectDialog.experience')}
                  </span>
                  <span className="font-mono text-xs text-ink-soft tabular-nums">
                    ({experienceItems.length})
                  </span>
                </div>
                {expandedSections.has('experience') ? (
                  <CaretDown aria-hidden="true" className="size-4" />
                ) : (
                  <CaretRight aria-hidden="true" className="size-4" />
                )}
              </button>
              {expandedSections.has('experience') && (
                <div className="border-t border-ink">
                  {experienceItems.map((item) => (
                    <ItemRow
                      key={item.item_id}
                      item={item}
                      isSelected={isSelected(item)}
                      onToggle={() => toggleItem(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Projects Section */}
          {projectItems.length > 0 && (
            <div className="border border-ink">
              <button
                type="button"
                onClick={() => toggleSection('projects')}
                aria-expanded={expandedSections.has('projects')}
                className="w-full p-4 flex items-center justify-between bg-canvas hover:bg-panel transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm uppercase tracking-wider font-medium">
                    {t('builder.regenerate.selectDialog.projects')}
                  </span>
                  <span className="font-mono text-xs text-ink-soft tabular-nums">
                    ({projectItems.length})
                  </span>
                </div>
                {expandedSections.has('projects') ? (
                  <CaretDown aria-hidden="true" className="size-4" />
                ) : (
                  <CaretRight aria-hidden="true" className="size-4" />
                )}
              </button>
              {expandedSections.has('projects') && (
                <div className="border-t border-ink">
                  {projectItems.map((item) => (
                    <ItemRow
                      key={item.item_id}
                      item={item}
                      isSelected={isSelected(item)}
                      onToggle={() => toggleItem(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Skills Section */}
          {skillsItem && (
            <div className="border border-ink">
              <button
                type="button"
                onClick={() => toggleSection('skills')}
                aria-expanded={expandedSections.has('skills')}
                className="w-full p-4 flex items-center justify-between bg-canvas hover:bg-panel transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm uppercase tracking-wider font-medium">
                    {t('builder.regenerate.selectDialog.skills')}
                  </span>
                </div>
                {expandedSections.has('skills') ? (
                  <CaretDown aria-hidden="true" className="size-4" />
                ) : (
                  <CaretRight aria-hidden="true" className="size-4" />
                )}
              </button>
              {expandedSections.has('skills') && (
                <div className="border-t border-ink">
                  <ItemRow
                    item={skillsItem}
                    isSelected={isSelected(skillsItem)}
                    onToggle={() => toggleItem(skillsItem)}
                  />
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t('common.cancel')}</Button>
          </DialogClose>
          <Button onClick={onContinue} disabled={selectedItems.length === 0}>
            {t('builder.regenerate.selectDialog.continueButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * ItemRow - Individual selectable item row
 */
interface ItemRowProps {
  item: RegenerateItemInput;
  isSelected: boolean;
  onToggle: () => void;
}

const ItemRow: React.FC<ItemRowProps> = ({ item, isSelected, onToggle }) => {
  const { t } = useTranslations();

  const contentCount = item.current_content.length;
  const itemCountKey =
    contentCount === 1
      ? 'builder.regenerate.selectDialog.itemCount.one'
      : 'builder.regenerate.selectDialog.itemCount.other';
  const itemCountLabel = t(itemCountKey).replace('{count}', String(contentCount));

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isSelected}
      className={`w-full p-4 flex items-center gap-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
        isSelected ? 'bg-panel' : 'bg-white hover:bg-panel'
      }`}
    >
      {/* Checkbox */}
      <span
        aria-hidden="true"
        className={`size-6 shrink-0 border border-ink flex items-center justify-center transition-colors ${
          isSelected ? 'bg-ink' : 'bg-white'
        }`}
      >
        {isSelected && <Check aria-hidden="true" className="size-4 text-white" />}
      </span>

      {/* Item Info */}
      <div className="flex-1 min-w-0">
        <div className="font-sans font-medium text-sm truncate">{item.title}</div>
        {item.subtitle && (
          <div className="font-mono text-xs text-ink-soft truncate">{item.subtitle}</div>
        )}
      </div>

      {/* Content preview */}
      <div className="font-mono text-xs text-ink-soft tabular-nums">{itemCountLabel}</div>
    </button>
  );
};

export default RegenerateDialog;
