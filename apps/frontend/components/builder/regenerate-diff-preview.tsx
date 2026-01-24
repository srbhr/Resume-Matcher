'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Check,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Briefcase,
  FolderKanban,
  Lightbulb,
} from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import type { RegeneratedItem } from '@/lib/api/enrichment';

interface RegenerateDiffPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regeneratedItems: RegeneratedItem[];
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
  isApplying: boolean;
}

/**
 * RegenerateDiffPreview Component
 *
 * Third step of the regenerate wizard.
 * Shows side-by-side comparison of original vs regenerated content.
 * Swiss International Style design.
 */
export const RegenerateDiffPreview: React.FC<RegenerateDiffPreviewProps> = ({
  open,
  onOpenChange,
  regeneratedItems,
  error,
  onAccept,
  onReject,
  isApplying,
}) => {
  const { t } = useTranslations();
  const [expandedItems, setExpandedItems] = React.useState<Set<string>>(
    new Set(regeneratedItems.map((item) => item.item_id))
  );

  React.useEffect(() => {
    // Expand all items when regeneratedItems changes
    setExpandedItems(new Set(regeneratedItems.map((item) => item.item_id)));
  }, [regeneratedItems]);

  const toggleItem = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const getItemLabel = (item: RegeneratedItem) => {
    if (item.item_type === 'skills') {
      return t('builder.regenerate.selectDialog.skills');
    }

    const title = item.title?.trim();
    const subtitle = item.subtitle?.trim();

    if (title && subtitle) {
      return `${title} | ${subtitle}`;
    }

    return title || item.item_id;
  };

  const getItemIcon = (itemType: string) => {
    switch (itemType) {
      case 'experience':
        return <Briefcase className="w-4 h-4" />;
      case 'project':
        return <FolderKanban className="w-4 h-4" />;
      case 'skills':
        return <Lightbulb className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const resolveErrorMessage = (value: string) => {
    if (value === 'No changes to apply') {
      return t('builder.regenerate.errors.noChangesToApply');
    }

    if (/network|fetch/i.test(value) || value.includes('Failed to fetch')) {
      return t('builder.regenerate.errors.networkError');
    }

    return t('builder.regenerate.errors.applyFailed');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] p-0 gap-0 rounded-none overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-black">
          <DialogTitle className="font-serif text-xl font-bold uppercase tracking-tight">
            {t('builder.regenerate.diffPreview.title')}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-gray-600 mt-2">
            {t('builder.regenerate.diffPreview.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Stats Card */}
        <div className="px-6 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 text-green-700 font-mono text-xs">
            <Check className="w-3 h-3" />
            {t('builder.regenerate.diffPreview.changesCount').replace(
              '{count}',
              String(regeneratedItems.length)
            )}
          </div>
        </div>

        {error ? (
          <div className="px-6 pt-4">
            <div className="border border-red-600 bg-red-50 px-4 py-3">
              <p className="font-mono text-xs text-red-700">{resolveErrorMessage(error)}</p>
            </div>
          </div>
        ) : null}

        {/* Diff Content */}
        <div className="p-6 space-y-4 max-h-[50vh] overflow-y-auto">
          {regeneratedItems.map((item) => (
            <div key={item.item_id} className="border border-black">
              {/* Item Header */}
              <button
                type="button"
                onClick={() => toggleItem(item.item_id)}
                className="w-full p-4 flex items-center justify-between bg-[#F0F0E8] hover:bg-[#E5E5E0] transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getItemIcon(item.item_type)}
                  <span className="font-mono text-sm tracking-wider font-medium truncate">
                    {getItemLabel(item)}
                  </span>
                </div>
                {expandedItems.has(item.item_id) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              {/* Item Diff Content */}
              {expandedItems.has(item.item_id) && (
                <div className="border-t border-black">
                  {/* Change Summary */}
                  {item.diff_summary && (
                    <div className="p-3 border-b border-black">
                      <p className="font-mono text-xs text-blue-700">{item.diff_summary}</p>
                    </div>
                  )}

                  {/* Original Content */}
                  <div className="p-4 border-b border-black">
                    <div className="font-mono text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
                      <span className="w-3 h-3 bg-red-600 border border-black" />
                      {t('builder.regenerate.diffPreview.originalLabel')}
                    </div>
                    <div className="border-2 border-black bg-white p-3 space-y-1">
                      {item.original_content.length > 0 ? (
                        item.original_content.map((content, idx) => (
                          <p key={idx} className="text-sm text-red-700 line-through">
                            • {content}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400 italic">
                          {t('builder.regenerate.diffPreview.noContent')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* New Content */}
                  <div className="p-4">
                    <div className="font-mono text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
                      <span className="w-3 h-3 bg-green-700 border border-black" />
                      {t('builder.regenerate.diffPreview.newLabel')}
                    </div>
                    <div className="border-2 border-black bg-white p-3 space-y-1">
                      {item.new_content.length > 0 ? (
                        item.new_content.map((content, idx) => (
                          <p key={idx} className="text-sm text-green-700">
                            • {content}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400 italic">
                          {t('builder.regenerate.diffPreview.noContent')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="p-4 bg-[#E5E5E0] border-t border-black flex-row justify-between gap-3">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={isApplying}
            className="rounded-none border-black"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('builder.regenerate.diffPreview.rejectButton')}
          </Button>
          <Button
            variant="success"
            onClick={onAccept}
            disabled={isApplying}
            className="rounded-none"
          >
            {isApplying ? (
              <>
                <span className="animate-spin mr-2">
                  <Check className="w-4 h-4" />
                </span>
                {t('builder.regenerate.diffPreview.applying')}
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                {t('builder.regenerate.diffPreview.acceptButton')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RegenerateDiffPreview;
