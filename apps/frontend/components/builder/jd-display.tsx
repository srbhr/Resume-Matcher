'use client';

import { FileText } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

interface JDDisplayProps {
  content: string;
}

/**
 * Read-only display of the job description.
 * Shows the original JD text in a scrollable container.
 */
export function JDDisplay({ content }: JDDisplayProps) {
  const { t } = useTranslations();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-paper-tint bg-paper-tint">
        <FileText className="w-4 h-4 text-ink-soft" />
        <h3 className="font-mono text-sm font-bold uppercase text-ink-soft">
          {t('builder.jdMatch.jobDescriptionTitle')}
        </h3>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{content}</div>
      </div>
    </div>
  );
}
