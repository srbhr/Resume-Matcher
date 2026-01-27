'use client';

import { Button } from '@/components/ui/button';
import { Check, X, Briefcase, FolderKanban } from 'lucide-react';
import type { EnhancedDescription } from '@/lib/api/enrichment';
import { useTranslations } from '@/lib/i18n';

interface PreviewStepProps {
  enhancements: EnhancedDescription[];
  onApply: () => void;
  onCancel: () => void;
}

export function PreviewStep({ enhancements, onApply, onCancel }: PreviewStepProps) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">{t('enrichment.preview.title')}</h2>
        <p className="text-gray-600 font-mono text-sm">{t('enrichment.preview.description')}</p>
      </div>

      {/* Enhancements list */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {enhancements.map((enhancement) => (
          <EnhancementCard key={enhancement.item_id} enhancement={enhancement} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200 mt-6">
        <Button variant="outline" onClick={onCancel} className="gap-2">
          <X className="w-4 h-4" />
          {t('common.cancel')}
        </Button>
        <Button onClick={onApply} className="gap-2">
          <Check className="w-4 h-4" />
          {t('enrichment.preview.applyButton')}
        </Button>
      </div>
    </div>
  );
}

interface EnhancementCardProps {
  enhancement: EnhancedDescription;
}

function EnhancementCard({ enhancement }: EnhancementCardProps) {
  const { t } = useTranslations();
  const itemTypeLabel =
    enhancement.item_type === 'experience'
      ? t('enrichment.itemType.experience')
      : t('enrichment.itemType.project');

  return (
    <div className="border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-black bg-gray-50">
        {enhancement.item_type === 'experience' ? (
          <Briefcase className="w-4 h-4" />
        ) : (
          <FolderKanban className="w-4 h-4" />
        )}
        <span className="font-mono text-sm font-bold uppercase">{itemTypeLabel}</span>
        <span className="text-gray-600">|</span>
        <span className="font-semibold">{enhancement.title}</span>
      </div>

      {/* Content preview */}
      <div className="p-4">
        <div className="space-y-4">
          {/* Existing bullets - keeping */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold uppercase text-gray-600">
                {t('enrichment.preview.keepingLabel')}
              </span>
              <span className="text-xs text-gray-400">
                {t('enrichment.preview.existingCount', {
                  count: enhancement.original_description.length,
                })}
              </span>
            </div>
            <ul className="space-y-2">
              {enhancement.original_description.map((bullet, i) => (
                <li key={i} className="text-sm text-gray-700 pl-4 border-l-2 border-gray-300">
                  {bullet}
                </li>
              ))}
              {enhancement.original_description.length === 0 && (
                <li className="text-sm text-gray-400 italic">
                  {t('enrichment.preview.noExistingDescription')}
                </li>
              )}
            </ul>
          </div>

          {/* New bullets - adding */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold uppercase text-green-600">
                {t('enrichment.preview.addingLabel')}
              </span>
              <span className="text-xs text-green-600">
                {t('enrichment.preview.newCount', {
                  count: enhancement.enhanced_description.length,
                })}
              </span>
            </div>
            <ul className="space-y-2">
              {enhancement.enhanced_description.map((bullet, i) => (
                <li
                  key={i}
                  className="text-sm text-gray-900 pl-4 border-l-2 border-green-500 bg-green-50 py-1 pr-2"
                >
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
