'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { PanelHeader } from '@/components/ui/panel-header';
import { Textarea } from '@/components/ui/textarea';
import { Save, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

export interface CoverLetterEditorProps {
  /** Cover letter content */
  content: string;
  /** Callback when content changes */
  onChange: (content: string) => void;
  /** Callback when save is triggered */
  onSave: () => void;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Additional class names */
  className?: string;
}

export function CoverLetterEditor({
  content,
  onChange,
  onSave,
  isSaving,
  className,
}: CoverLetterEditorProps) {
  const { t } = useTranslations();
  const wordCount = content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const charCount = content.length;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <PanelHeader
        tone="input"
        level="h3"
        title={t('coverLetter.title')}
        className="mb-0 bg-paper p-4"
      >
        <span className="font-mono text-xs text-steel tabular-nums">
          {t('builder.contentStats.wordsChars', { wordCount, charCount })}
        </span>
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </PanelHeader>

      {/* Editor Area */}
      <div className="flex-1 p-4 overflow-hidden">
        <Textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.stopPropagation()}
          placeholder={t('coverLetter.editor.placeholder')}
          className="h-full min-h-[400px] p-4 leading-relaxed resize-none"
        />
      </div>

      {/* Footer Tips */}
      <div className="p-4 border-t border-paper bg-paper">
        <p className="font-mono text-xs text-steel">{t('coverLetter.editor.tip')}</p>
      </div>
    </div>
  );
}
