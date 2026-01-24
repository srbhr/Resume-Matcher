'use client';

import React from 'react';
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
import { Briefcase, FolderKanban, Lightbulb, ChevronDown, ChevronRight } from 'lucide-react';
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
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 rounded-none">
        <DialogHeader className="p-6 pb-4 border-b border-black">
          <DialogTitle className="font-serif text-xl font-bold uppercase tracking-tight">
            {t('builder.regenerate.selectDialog.title')}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-gray-600 mt-2">
            {t('builder.regenerate.selectDialog.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4 max-h-[50vh] overflow-y-auto">
          {!hasItems && (
            <div className="text-center py-8 text-gray-500 font-mono text-sm">
              {t('builder.regenerate.selectDialog.noItemsAvailable')}
            </div>
          )}

          {/* Experience Section */}
          {experienceItems.length > 0 && (
            <div className="border border-black">
              <button
                type="button"
                onClick={() => toggleSection('experience')}
                aria-expanded={expandedSections.has('experience')}
                className="w-full p-4 flex items-center justify-between bg-[#F0F0E8] hover:bg-[#E5E5E0] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Briefcase className="w-5 h-5" />
                  <span className="font-mono text-sm uppercase tracking-wider font-medium">
                    {t('builder.regenerate.selectDialog.experience')}
                  </span>
                  <span className="font-mono text-xs text-gray-500">
                    ({experienceItems.length})
                  </span>
                </div>
                {expandedSections.has('experience') ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              {expandedSections.has('experience') && (
                <div className="border-t border-black">
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
            <div className="border border-black">
              <button
                type="button"
                onClick={() => toggleSection('projects')}
                aria-expanded={expandedSections.has('projects')}
                className="w-full p-4 flex items-center justify-between bg-[#F0F0E8] hover:bg-[#E5E5E0] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FolderKanban className="w-5 h-5" />
                  <span className="font-mono text-sm uppercase tracking-wider font-medium">
                    {t('builder.regenerate.selectDialog.projects')}
                  </span>
                  <span className="font-mono text-xs text-gray-500">({projectItems.length})</span>
                </div>
                {expandedSections.has('projects') ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              {expandedSections.has('projects') && (
                <div className="border-t border-black">
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
            <div className="border border-black">
              <button
                type="button"
                onClick={() => toggleSection('skills')}
                aria-expanded={expandedSections.has('skills')}
                className="w-full p-4 flex items-center justify-between bg-[#F0F0E8] hover:bg-[#E5E5E0] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Lightbulb className="w-5 h-5" />
                  <span className="font-mono text-sm uppercase tracking-wider font-medium">
                    {t('builder.regenerate.selectDialog.skills')}
                  </span>
                </div>
                {expandedSections.has('skills') ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              {expandedSections.has('skills') && (
                <div className="border-t border-black">
                  <ItemRow
                    item={skillsItem}
                    isSelected={isSelected(skillsItem)}
                    onToggle={() => toggleItem(skillsItem)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 bg-[#E5E5E0] border-t border-black flex-row justify-end gap-3">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-none border-black">
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <Button
            onClick={onContinue}
            disabled={selectedItems.length === 0}
            className="rounded-none"
          >
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
      className={`w-full p-4 flex items-center gap-4 text-left transition-colors ${
        isSelected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
      }`}
    >
      {/* Checkbox */}
      <div
        className={`w-5 h-5 border-2 flex items-center justify-center transition-colors ${
          isSelected ? 'border-blue-700 bg-blue-700' : 'border-black bg-white'
        }`}
      >
        {isSelected && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Item Info */}
      <div className="flex-1 min-w-0">
        <div className="font-sans font-medium text-sm truncate">{item.title}</div>
        {item.subtitle && (
          <div className="font-mono text-xs text-gray-500 truncate">{item.subtitle}</div>
        )}
      </div>

      {/* Content preview */}
      <div className="font-mono text-xs text-gray-400">{itemCountLabel}</div>
    </button>
  );
};

export default RegenerateDialog;
