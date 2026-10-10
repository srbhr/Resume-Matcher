'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { LinkedinLogo, Envelope } from '@phosphor-icons/react';
import { useTranslations } from '@/lib/i18n';

export interface OutreachPreviewProps {
  /** Outreach message content */
  content: string;
  /** Additional class names */
  className?: string;
}

export function OutreachPreview({ content, className }: OutreachPreviewProps) {
  const { t } = useTranslations();
  return (
    <div
      className={cn(
        'bg-white border-2 border-ink',
        'shadow-sw-nested',
        'overflow-hidden',
        className
      )}
    >
      {/* Preview Header */}
      <div className="p-4 border-b-2 border-ink bg-paper">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <LinkedinLogo aria-hidden="true" className="size-4 text-ink" />
            <span className="font-mono text-xs uppercase">
              {t('outreach.preview.channels.linkedin')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Envelope aria-hidden="true" className="size-4 text-ink-soft" />
            <span className="font-mono text-xs uppercase">
              {t('outreach.preview.channels.email')}
            </span>
          </div>
        </div>
      </div>

      {/* Message Preview */}
      <div className="p-6 md:p-8">
        {content ? (
          <div className="space-y-4">
            {/* Message Bubble Style */}
            <div className="bg-paper border-2 border-ink p-4">
              <p className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
            </div>

            {/* Usage Tips */}
            <div className="pt-4 border-t border-paper">
              <p className="font-mono text-xs text-steel uppercase mb-2">
                {t('outreach.preview.howToUseTitle')}
              </p>
              <ul className="font-mono text-xs text-steel space-y-1">
                <li>{t('outreach.preview.steps.step1')}</li>
                <li>{t('outreach.preview.steps.step2')}</li>
                <li>{t('outreach.preview.steps.step3')}</li>
                <li>{t('outreach.preview.steps.step4')}</li>
              </ul>
            </div>
          </div>
        ) : (
          <EmptyState
            title={t('outreach.preview.emptyTitle')}
            description={t('outreach.preview.emptyDescription')}
          />
        )}
      </div>
    </div>
  );
}
