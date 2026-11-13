'use client';

import React, { useState } from 'react';
import { Copy, EnvelopeSimple, SpinnerGap } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { draftFollowUp, updateApplication, type Application } from '@/lib/api/tracker';
import { useOptionalStatusCache } from '@/lib/context/status-cache';
import { useTranslations } from '@/lib/i18n';
import { daysSinceApplied } from '@/lib/tracker-follow-up';

interface FollowUpPanelProps {
  application: Pick<Application, 'application_id' | 'status' | 'applied_at'>;
  /** Called after the card moves to No Response. */
  onMoved: () => void;
}

/** Draft a follow-up email for a card still waiting on a reply, or mark it No Response. */
export function FollowUpPanel({ application, onMoved }: FollowUpPanelProps) {
  const { t } = useTranslations();
  // Agent mode makes no model calls; the user's coding agent writes the email.
  // Until the status loads the mode is unknown, so drafting stays disabled.
  const status = useOptionalStatusCache()?.status ?? null;
  const agentMode = Boolean(status?.agent_mode);
  const [draft, setDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftFailed, setDraftFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveFailed, setMoveFailed] = useState(false);

  // Read once: re-rendering must not change the output, and days are coarse.
  const [now] = useState(() => new Date());
  const days = daysSinceApplied(application.applied_at, now);

  const handleDraft = async () => {
    setDrafting(true);
    setDraftFailed(false);
    try {
      setDraft(await draftFollowUp(application.application_id));
    } catch {
      // Generic message only: the backend's error text is not shown to users.
      setDraftFailed(true);
    } finally {
      setDrafting(false);
    }
  };

  const handleCopy = async () => {
    if (draft === null) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleMove = async () => {
    setMoving(true);
    setMoveFailed(false);
    try {
      await updateApplication(application.application_id, { status: 'no_response' });
      onMoved();
    } catch {
      setMoveFailed(true);
    } finally {
      setMoving(false);
    }
  };

  // Keep textarea Enter from bubbling to dialog/global handlers.
  const handleDraftKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };

  return (
    <section className="space-y-2 border-t border-ink pt-4">
      <Label>{t('tracker.followUp.title')}</Label>
      {days !== null && (
        <p className="text-sm text-ink-soft">
          {t('tracker.followUp.description', { days: String(days) })}
        </p>
      )}

      {agentMode ? (
        <p className="font-mono text-xs text-steel">{t('tracker.followUp.agentHint')}</p>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleDraft}
          disabled={drafting || status === null}
        >
          {drafting ? (
            <>
              <SpinnerGap aria-hidden="true" className="animate-spin" />
              {t('tracker.followUp.drafting')}
            </>
          ) : (
            <>
              <EnvelopeSimple aria-hidden="true" />
              {t('tracker.followUp.draft')}
            </>
          )}
        </Button>
      )}
      {draftFailed && <Alert tone="error">{t('tracker.followUp.failed')}</Alert>}

      {draft !== null && (
        <div className="space-y-1">
          <Label htmlFor="follow-up-draft">{t('tracker.followUp.draftLabel')}</Label>
          <Textarea
            id="follow-up-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleDraftKeyDown}
            rows={8}
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
              <Copy aria-hidden="true" />
              {copied ? t('tracker.followUp.copied') : t('tracker.followUp.copy')}
            </Button>
          </div>
        </div>
      )}

      {application.status === 'applied' && (
        <div className="space-y-2">
          <Button type="button" size="sm" variant="ghost" onClick={handleMove} disabled={moving}>
            {t('tracker.followUp.moveToNoResponse')}
          </Button>
          {moveFailed && <Alert tone="error">{t('tracker.errors.moveFailed')}</Alert>}
        </div>
      )}
    </section>
  );
}
