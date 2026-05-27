'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Save, Loader2, FileText, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';
import {
  type CoverLetterSettings,
  type CoverLetterHeadingField,
  DEFAULT_COVER_LETTER_SETTINGS,
  ALL_HEADING_FIELDS,
} from '@/lib/types/cover-letter-settings';

const HEADING_STYLE_LABELS: Record<CoverLetterSettings['headingStyle'], string> = {
  professional: 'Professional',
  centered: 'Centered',
  minimal: 'Minimal',
};

const FIELD_LABELS: Record<CoverLetterHeadingField, string> = {
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  website: 'Website',
};

export interface CoverLetterEditorProps {
  /** Cover letter content */
  content: string;
  /** Callback when content changes */
  onChange: (content: string) => void;
  /** Callback when save is triggered */
  onSave: () => void;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Current heading settings */
  settings?: CoverLetterSettings;
  /** Callback when heading settings change */
  onSettingsChange?: (settings: CoverLetterSettings) => void;
  /** Additional class names */
  className?: string;
}

export function CoverLetterEditor({
  content,
  onChange,
  onSave,
  isSaving,
  settings,
  onSettingsChange,
  className,
}: CoverLetterEditorProps) {
  const { t } = useTranslations();
  const [showSettings, setShowSettings] = React.useState(false);

  const s = settings ?? DEFAULT_COVER_LETTER_SETTINGS;

  const wordCount = content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const charCount = content.length;

  function updateSettings(patch: Partial<CoverLetterSettings>) {
    onSettingsChange?.({ ...s, ...patch });
  }

  function toggleField(field: CoverLetterHeadingField) {
    const current = s.headingFields;
    const next = current.includes(field) ? current.filter((f) => f !== field) : [...current, field];
    updateSettings({ headingFields: next });
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b-2 border-black bg-[#F5F5F0]">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
            {t('coverLetter.title')}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-steel-grey">
            {t('builder.contentStats.wordsChars', { wordCount, charCount })}
          </span>
          {onSettingsChange && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSettings((v) => !v)}
              aria-expanded={showSettings}
            >
              <Settings2 className="w-4 h-4" />
              {showSettings ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </Button>
          )}
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {/* Heading Settings Panel */}
      {showSettings && onSettingsChange && (
        <div className="border-b-2 border-black bg-[#F8F8F4] p-4 space-y-4">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink">
            {t('coverLetter.heading.settingsTitle')}
          </p>

          {/* Heading Style */}
          <div>
            <p className="font-mono text-xs text-steel-grey mb-2">
              {t('coverLetter.heading.style')}
            </p>
            <div className="flex gap-2 flex-wrap">
              {(['professional', 'centered', 'minimal'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => updateSettings({ headingStyle: style })}
                  className={cn(
                    'font-mono text-xs px-3 py-1 border-2 transition-colors',
                    s.headingStyle === style
                      ? 'border-black bg-black text-white'
                      : 'border-black bg-white text-ink hover:bg-[#F0F0E8]'
                  )}
                >
                  {HEADING_STYLE_LABELS[style]}
                </button>
              ))}
            </div>
          </div>

          {/* Show Title */}
          <div className="flex items-center gap-3">
            <input
              id="show-title"
              type="checkbox"
              checked={s.showTitle}
              onChange={(e) => updateSettings({ showTitle: e.target.checked })}
              className="w-4 h-4 border-2 border-black accent-black"
            />
            <label htmlFor="show-title" className="font-mono text-xs text-ink cursor-pointer">
              {t('coverLetter.heading.showTitle')}
            </label>
          </div>

          {/* Visible Fields */}
          <div>
            <p className="font-mono text-xs text-steel-grey mb-2">
              {t('coverLetter.heading.contactFields')}
            </p>
            <div className="flex gap-2 flex-wrap">
              {ALL_HEADING_FIELDS.map((field) => {
                const active = s.headingFields.includes(field);
                return (
                  <button
                    key={field}
                    onClick={() => toggleField(field)}
                    className={cn(
                      'font-mono text-xs px-3 py-1 border-2 transition-colors',
                      active
                        ? 'border-black bg-black text-white'
                        : 'border-black bg-white text-ink hover:bg-[#F0F0E8]'
                    )}
                  >
                    {FIELD_LABELS[field]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Editor Area */}
      <div className="flex-1 p-4 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.stopPropagation();
          }}
          placeholder={t('coverLetter.editor.placeholder')}
          className={cn(
            'w-full h-full min-h-[400px] p-4',
            'font-mono text-sm leading-relaxed',
            'border-2 border-black bg-white',
            'resize-none',
            'focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2',
            'placeholder:text-steel-grey'
          )}
        />
      </div>

      {/* Footer Tips */}
      <div className="p-4 border-t border-paper-tint bg-[#F5F5F0]">
        <p className="font-mono text-xs text-steel-grey">{t('coverLetter.editor.tip')}</p>
      </div>
    </div>
  );
}
