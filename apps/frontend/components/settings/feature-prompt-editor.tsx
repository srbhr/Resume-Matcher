'use client';

import { SpinnerGap } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from '@/lib/i18n';

/**
 * A custom prompt for a generated attachment (cover letter, outreach message):
 * the field, with the built-in prompt as its placeholder, Save, and Reset to the
 * built-in one. A prompt the server refused (missing placeholders) is announced
 * and tied to the field.
 */
export function FeaturePromptEditor({
  id,
  value,
  placeholder,
  missing,
  saving,
  onChange,
  onSave,
  onReset,
}: {
  id: string;
  value: string;
  /** The built-in prompt, shown while the field is empty. */
  placeholder: string;
  /** The placeholders the server found missing, or null when it accepted the prompt. */
  missing: string[] | null;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslations();
  const errorId = `${id}-error`;
  return (
    <div className="pl-6 space-y-2">
      <Label htmlFor={id}>{t('settings.contentGeneration.customPromptLabel')}</Label>
      <Textarea
        id={id}
        rows={8}
        aria-invalid={missing !== null}
        aria-describedby={missing !== null ? errorId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-xs break-words"
      />
      <p className="text-xs text-steel font-mono">
        {t('settings.contentGeneration.customPromptHelp')}
      </p>
      {missing !== null && (
        <p id={errorId} role="alert" className="text-xs text-destructive font-mono break-words">
          {t('settings.contentGeneration.customPromptErrorMissing', {
            missing: missing.join(', '),
          })}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onSave} disabled={saving}>
          {saving ? (
            <>
              <SpinnerGap aria-hidden="true" className="animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            t('common.save')
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onReset} disabled={saving}>
          {t('settings.contentGeneration.customPromptResetButton')}
        </Button>
      </div>
    </div>
  );
}
