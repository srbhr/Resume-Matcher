'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ClipboardText } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { JobDetails } from '@/hooks/use-job-details';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** The shortest job description the backend will tailor from. */
export const MIN_JOB_DESCRIPTION_LENGTH = 50;

interface JobInputProps {
  /** Id of the description field; its hint and counter hang off it. */
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Role, company (and job ID) for the pasted job, from `useJobDetails`. */
  details: JobDetails;
  /** The queue keeps a job ID; tailoring one job needs only role and company. */
  showJobId?: boolean;
  /** The field's label and hint; the Tailor page's by default. */
  label?: string;
  hint?: string;
  disabled?: boolean;
  /** Sizes the block: the description field takes whatever height is left. */
  className?: string;
}

/**
 * The job being tailored for: a ruled strip of Role and Company (filled from the
 * text, editable), then the description field, which grows to the height it is
 * given. Empty, it says what to paste and offers to paste from the clipboard;
 * under it, the character count and the minimum while the text is too short.
 */
export function JobInput({
  id,
  value,
  onChange,
  details,
  showJobId = false,
  label,
  hint,
  disabled = false,
  className,
}: JobInputProps) {
  const { t, locale } = useTranslations();
  const fieldLabel = label ?? t('tailor.pasteJobDescription');
  const fieldHint = hint ?? t('tailor.jobDescriptionHint');
  const hintId = `${id}-hint`;
  const length = value.trim().length;
  // The clipboard API exists only in secure contexts; decide after mount so the
  // server and client render the same thing.
  const [canPaste, setCanPaste] = useState(false);
  // Why the last paste did nothing: the clipboard couldn't be read, or held no text.
  const [pasteProblem, setPasteProblem] = useState<'failed' | 'empty' | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = !value.trim();
  useEffect(() => {
    setCanPaste(typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText));
  }, []);

  const paste = async () => {
    setPasteProblem(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteProblem('empty');
        return;
      }
      onChange(text);
      // The paste button goes with the empty state; keep focus in the field, at the end.
      requestAnimationFrame(() => {
        const field = fieldRef.current;
        if (!field) return;
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      });
    } catch {
      // Permission refused: typing and Cmd/Ctrl+V still work.
      setPasteProblem('failed');
    }
  };

  const detail = (field: 'role' | 'company' | 'jobReqId', label: string, placeholder: string) => (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={`${id}-${field}`}>{label}</Label>
      <Input
        id={`${id}-${field}`}
        value={details[field]}
        onChange={(e) => details.edit(field, e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-9"
      />
    </div>
  );

  return (
    <div className={cn('flex min-h-0 flex-col gap-4', className)}>
      <div className={cn('grid gap-3', showJobId ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {detail('role', t('jobInput.role'), t('jobInput.rolePlaceholder'))}
        {detail('company', t('jobInput.company'), t('jobInput.companyPlaceholder'))}
        {showJobId && detail('jobReqId', t('jobInput.jobId'), t('common.optional'))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <Label htmlFor={id}>{fieldLabel}</Label>
        <div className="relative flex min-h-48 flex-1">
          <Textarea
            ref={fieldRef}
            id={id}
            aria-describedby={hintId}
            value={value}
            onChange={(e) => {
              setPasteProblem(null);
              onChange(e.target.value);
            }}
            onKeyDown={(e) => {
              // The field sits in pages that act on Enter; keep Enter for new lines.
              if (e.key === 'Enter') e.stopPropagation();
            }}
            disabled={disabled}
            className="min-h-48 flex-1 resize-none p-4"
          />
          {isEmpty && (
            // The empty state sits over the field; clicks fall through to it, so
            // typing and Cmd/Ctrl+V work, except on the paste button.
            <div className="pointer-events-none absolute inset-0 flex flex-col items-start justify-center gap-2 p-6">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink">
                {t('jobInput.emptyTitle')}
              </p>
              <p id={hintId} className="max-w-md text-sm text-ink-soft text-pretty">
                {fieldHint}
              </p>
              {canPaste && !disabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-events-auto mt-2"
                  onClick={() => void paste()}
                >
                  <ClipboardText aria-hidden="true" />
                  {t('jobInput.paste')}
                </Button>
              )}
              {pasteProblem && (
                <p role="status" className="text-xs text-ink-soft">
                  {t(pasteProblem === 'empty' ? 'jobInput.pasteEmpty' : 'jobInput.pasteFailed')}
                </p>
              )}
            </div>
          )}
        </div>
        {!isEmpty && (
          <p id={hintId} className="sr-only">
            {fieldHint}
          </p>
        )}
        <div className="flex justify-between gap-4 font-mono text-xs uppercase tracking-wider text-steel tabular-nums">
          <span>
            {t('tailor.charactersCount', {
              count: new Intl.NumberFormat(locale).format(value.length),
            })}
          </span>
          {length > 0 && length < MIN_JOB_DESCRIPTION_LENGTH && (
            <span className="text-warning-text">
              {t('jobInput.minimum', { min: MIN_JOB_DESCRIPTION_LENGTH })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
