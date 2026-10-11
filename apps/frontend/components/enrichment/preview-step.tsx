'use client';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Check, X } from '@phosphor-icons/react';
import type { EnhancedDescription, EnhancementItemError } from '@/lib/api/enrichment';
import { useTranslations } from '@/lib/i18n';

interface PreviewStepProps {
  enhancements: EnhancedDescription[];
  errors?: EnhancementItemError[];
  onApply: () => void;
  onCancel: () => void;
}

export function PreviewStep({ enhancements, errors = [], onApply, onCancel }: PreviewStepProps) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="font-serif text-xl font-bold mb-2">{t('enrichment.preview.title')}</h2>
        <p className="text-ink-soft font-mono text-sm">{t('enrichment.preview.description')}</p>
      </div>

      {errors.length > 0 && (
        <Alert tone="warning" className="mb-4" title={t('enrichment.preview.partialFailure')}>
          <p className="mb-2">{t('enrichment.preview.partialFailureDescription')}</p>
          <ul className="list-disc pl-4">
            {errors.map((error, index) => (
              <li key={`${error.item_type}:${error.item_id}:${index}`}>
                <span className="font-semibold">{error.title}</span>
                <span className="block">{error.message}</span>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Enhancements list */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {enhancements.map((enhancement) => (
          <EnhancementCard key={enhancement.item_id} enhancement={enhancement} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-paper mt-6">
        <Button variant="outline" onClick={onCancel}>
          <X aria-hidden="true" />
          {t('common.cancel')}
        </Button>
        <Button onClick={onApply}>
          <Check aria-hidden="true" />
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
    <div className="border-2 border-ink bg-white shadow-sw-nested">
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ink bg-paper">
        <span className="font-mono text-sm font-bold uppercase">{itemTypeLabel}</span>
        <span aria-hidden="true" className="text-ink-soft">
          |
        </span>
        <span className="font-semibold">{enhancement.title}</span>
      </div>

      {/* Content preview */}
      <div className="p-4">
        <div className="space-y-4">
          {/* Existing bullets - keeping */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold uppercase text-ink-soft">
                {t('enrichment.preview.keepingLabel')}
              </span>
              <span className="text-xs text-steel tabular-nums">
                {t('enrichment.preview.existingCount', {
                  count: enhancement.original_description.length,
                })}
              </span>
            </div>
            <ul className="space-y-2">
              {enhancement.original_description.map((bullet, i) => (
                <li key={i} className="text-sm text-ink-soft pl-4">
                  {bullet}
                </li>
              ))}
              {enhancement.original_description.length === 0 && (
                <li className="text-sm text-steel italic">
                  {t('enrichment.preview.noExistingDescription')}
                </li>
              )}
            </ul>
          </div>

          {/* New bullets - adding */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold uppercase text-success">
                {t('enrichment.preview.addingLabel')}
              </span>
              <span className="text-xs text-success tabular-nums">
                {t('enrichment.preview.newCount', {
                  count: enhancement.enhanced_description.length,
                })}
              </span>
            </div>
            <ul className="space-y-2">
              {enhancement.enhanced_description.map((bullet, i) => (
                <li
                  key={i}
                  className="text-sm text-ink-soft pl-4 bg-success-tint py-1 pr-2 border border-success"
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
