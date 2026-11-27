'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowsClockwise, SpinnerGap, Trash } from '@phosphor-icons/react';
import {
  fetchResumeList,
  fetchJobQueue,
  addJobToQueue,
  deleteQueueItem,
  clearQueueItems,
  QueueItemInProgressError,
  type QueueItem,
  type QueueItemStatus,
  type ResumeListItem,
} from '@/lib/api/resume';
import { fetchPromptConfig, type PromptOption } from '@/lib/api/config';
import { useStatusCache } from '@/lib/context/status-cache';
import { useTranslations } from '@/lib/i18n';
import { formatDate } from '@/lib/format-date';
import { useJobDetails } from '@/hooks/use-job-details';
import { JobInput, MIN_JOB_DESCRIPTION_LENGTH } from '@/components/jobs/job-input';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageFrame } from '@/components/ui/page-frame';
import { StatusIndicator, type StatusTone } from '@/components/ui/status-indicator';
import { LlmSetupAlert } from '@/components/common/llm-setup-alert';
import { AgentPromptDialog } from '@/components/agent/agent-prompt-dialog';
import { FadePresence } from '@/components/common/presence';

const POLL_INTERVAL_MS = 2500;
// The backend accepts 0-60 seconds; typing past either end snaps to it.
const MAX_COOLDOWN_SECONDS = 60;
const clampCooldown = (value: number) =>
  Number.isFinite(value) ? Math.min(MAX_COOLDOWN_SECONDS, Math.max(0, value)) : 0;

const STATUS_TONE: Record<QueueItemStatus, StatusTone> = {
  pending: 'neutral',
  processing: 'active',
  completed: 'ready',
  failed: 'error',
};

const FAILURE_CODES = new Set(['not_found', 'too_large', 'timeout', 'failed']);

const masterLabel = (m: ResumeListItem) => m.title || m.filename || m.resume_id;

export default function QueuePage() {
  const { t, locale } = useTranslations();
  const { status: systemStatus, isLoading: statusLoading, incrementJobs } = useStatusCache();
  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;
  // Agent mode: the user's coding agent tailors; the button shows a prompt for it.
  const agentMode = !statusLoading && Boolean(systemStatus?.agent_mode);
  const [showAgentPrompt, setShowAgentPrompt] = useState(false);

  // Master resumes
  const [masters, setMasters] = useState<ResumeListItem[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState('');
  const [resumesLoading, setResumesLoading] = useState(true);

  // Prompt options
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState('keywords');
  const [promptLoading, setPromptLoading] = useState(true);
  const hasUserSelectedPrompt = useRef(false);

  // Queue state
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueLoad, setQueueLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);
  const [isAddingToQueue, setIsAddingToQueue] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueSuccessMessage, setQueueSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form inputs
  const [jobDescriptionInput, setJobDescriptionInput] = useState('');
  // Role, company and job ID, detected from the text (no AI call); hand edits win.
  const jobDetails = useJobDetails(jobDescriptionInput);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number>(5);
  // Master, intensity and cooldown rarely change between jobs: folded to one line.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // When the list was last read, for "Updated 5s ago"; ticks so the label stays true.
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const descriptionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setResumesLoading(true);
      try {
        const list = await fetchResumeList(true);
        if (cancelled) return;
        const ready = list.filter((r) => r.is_master && r.processing_status === 'ready');
        setMasters(ready);
        const storedId = localStorage.getItem('master_resume_id');
        const initial =
          ready.find((r) => r.is_default_master) ??
          ready.find((r) => r.resume_id === storedId) ??
          ready[0];
        if (initial) setSelectedResumeId(initial.resume_id);
      } catch (err) {
        console.error('Failed to load resumes', err);
      } finally {
        if (!cancelled) setResumesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPromptLoading(true);
      try {
        const config = await fetchPromptConfig();
        if (!cancelled) {
          setPromptOptions(config.prompt_options || []);
          if (!hasUserSelectedPrompt.current) {
            setSelectedPromptId(config.default_prompt_id || 'keywords');
          }
        }
      } catch (err) {
        console.error('Failed to load prompt config', err);
      } finally {
        if (!cancelled) setPromptLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only the newest read may update the list; mutations also retire reads in flight.
  const queueRequest = useRef(0);
  // The master whose rows are on screen: a late answer about another one is dropped.
  const activeMaster = useRef('');

  const loadQueue = useCallback(async () => {
    // No master means no queue: an unfiltered read would list every master's jobs.
    if (!selectedResumeId || selectedResumeId !== activeMaster.current) return;
    const request = ++queueRequest.current;
    try {
      const items = await fetchJobQueue(selectedResumeId);
      if (request !== queueRequest.current) return;
      setQueueItems(items);
      setQueueLoad('ready');
      setLastUpdated(Date.now());
    } catch (err) {
      console.error('Failed to load queue', err);
      if (request === queueRequest.current) setQueueLoad('error');
    }
  }, [selectedResumeId]);

  // Wait for the master selection so an unfiltered read never lands last. A new
  // selection retires the read in flight and drops the previous master's rows, so
  // none stay actionable while the new queue loads.
  useEffect(() => {
    if (resumesLoading) return;
    activeMaster.current = selectedResumeId;
    queueRequest.current++;
    setQueueItems([]);
    if (!selectedResumeId) {
      setQueueLoad('ready');
      return;
    }
    setQueueLoad('loading');
    void loadQueue();
  }, [loadQueue, resumesLoading, selectedResumeId]);

  const hasActiveItems = queueItems.some(
    (item) => item.status === 'pending' || item.status === 'processing'
  );
  const pollingPaused = queueLoad === 'error';

  // Poll while an item is waiting or being tailored. One interval per active
  // stretch; a failed read pauses polling until the user retries.
  useEffect(() => {
    if (!hasActiveItems || pollingPaused) return;
    const interval = setInterval(loadQueue, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasActiveItems, pollingPaused, loadQueue]);

  const handleRefresh = async () => {
    setIsRefreshingQueue(true);
    try {
      await loadQueue();
    } finally {
      setIsRefreshingQueue(false);
    }
  };

  const handleAddToQueue = async () => {
    if (!selectedResumeId) {
      setQueueError(t('queue.form.noMaster'));
      return;
    }
    const trimmed = jobDescriptionInput.trim();
    if (trimmed.length < MIN_JOB_DESCRIPTION_LENGTH) {
      setQueueError(t('tailor.errors.jobDescriptionTooShort'));
      return;
    }

    setIsAddingToQueue(true);
    setQueueError(null);
    setQueueSuccessMessage(null);

    try {
      const newItem = await addJobToQueue(
        selectedResumeId,
        trimmed,
        rateLimitSeconds,
        jobDetails.role.trim() || undefined,
        jobDetails.company.trim() || undefined,
        jobDetails.jobReqId.trim() || undefined,
        selectedPromptId
      );
      queueRequest.current++;
      setQueueItems((prev) => [newItem, ...prev.filter((i) => i.item_id !== newItem.item_id)]);
      setJobDescriptionInput('');
      jobDetails.reset();
      setQueueSuccessMessage(t('queue.form.added'));
      incrementJobs();
      // Ready for the next posting at once.
      descriptionRef.current?.querySelector('textarea')?.focus();
    } catch (err) {
      console.error('Failed to add job to queue', err);
      setQueueError(t('queue.errors.addFailed'));
    } finally {
      setIsAddingToQueue(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const resumeId = selectedResumeId;
    setActionError(null);
    try {
      await deleteQueueItem(itemId);
      if (activeMaster.current !== resumeId) return;
      queueRequest.current++;
      setQueueItems((prev) => prev.filter((i) => i.item_id !== itemId));
    } catch (err) {
      console.error('Failed to delete queue item', err);
      if (err instanceof QueueItemInProgressError) {
        setActionError(t('queue.errors.deleteInProgress'));
        void loadQueue();
      } else {
        setActionError(t('queue.errors.deleteFailed'));
      }
    }
  };

  const handleClearCompleted = async () => {
    const resumeId = selectedResumeId;
    if (!resumeId) return;
    setActionError(null);
    try {
      await clearQueueItems(resumeId, 'completed');
      if (activeMaster.current !== resumeId) return;
      queueRequest.current++;
      setQueueItems((prev) => prev.filter((i) => i.status !== 'completed'));
    } catch (err) {
      console.error('Failed to clear completed items', err);
      setActionError(t('queue.errors.clearFailed'));
    }
  };

  const handleClearAll = async () => {
    const resumeId = selectedResumeId;
    if (!resumeId) return;
    setActionError(null);
    try {
      await clearQueueItems(resumeId);
      if (activeMaster.current !== resumeId) return;
      queueRequest.current++;
      setQueueItems((prev) => prev.filter((i) => i.status === 'processing'));
    } catch (err) {
      console.error('Failed to clear queue', err);
      setActionError(t('queue.errors.clearFailed'));
    }
  };

  const formDisabled = isAddingToQueue || !(isLlmConfigured || agentMode) || !selectedResumeId;

  // Keep "Updated 5s ago" true while the page is open.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const counts = {
    pending: queueItems.filter((i) => i.status === 'pending').length,
    processing: queueItems.filter((i) => i.status === 'processing').length,
    completed: queueItems.filter((i) => i.status === 'completed').length,
    failed: queueItems.filter((i) => i.status === 'failed').length,
  };
  // Place in line for waiting jobs, counted from the oldest: the API lists newest first.
  const placeInLine = new Map(
    queueItems
      .filter((i) => i.status === 'pending')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((item, index) => [item.item_id, index + 1])
  );
  const master = masters.find((m) => m.resume_id === selectedResumeId);
  const settingsSummary = [
    resumesLoading ? t('common.loading') : master ? masterLabel(master) : t('queue.form.noMaster'),
    t(`tailor.promptOptions.${selectedPromptId}.label`),
    rateLimitSeconds > 0 ? t('queue.monitor.cooldown', { seconds: rateLimitSeconds }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const updatedLabel =
    lastUpdated === null
      ? null
      : t('queue.monitor.updated', {
          when: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
            -Math.max(0, Math.round((now - lastUpdated) / 1000)),
            'second'
          ),
        });

  return (
    <PageFrame ground="crosses-wide">
      {/* One compact toolbar row, as on the other pages. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink px-6 py-3">
        <Link
          href="/dashboard"
          aria-label={t('common.back')}
          title={t('common.back')}
          className={buttonClass({ variant: 'outline', size: 'icon-sm', className: 'shrink-0' })}
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <h1 className="font-serif text-2xl font-bold uppercase leading-tight tracking-tight text-ink md:text-3xl">
          {t('queue.title')}
        </h1>
      </header>

      {/* Counts, drawn like the settings status strip. */}
      <dl className="grid grid-cols-2 gap-px border-b border-ink bg-ink sm:grid-cols-4">
        {(['pending', 'processing', 'completed', 'failed'] as const).map((status) => (
          <div key={status} className="bg-canvas px-6 py-3">
            <dt className="font-mono text-xs uppercase text-steel">
              {t(`queue.status.${status}`)}
            </dt>
            <dd className="font-mono text-2xl font-bold tabular-nums text-ink">{counts[status]}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Add a job */}
        <section
          aria-labelledby="queue-add-heading"
          className="min-w-0 space-y-4 border-b border-ink p-6 lg:border-r lg:border-b-0"
        >
          <h2
            id="queue-add-heading"
            className="font-mono text-xs font-bold uppercase tracking-wider text-ink-soft"
          >
            {t('queue.form.title')}
          </h2>

          {agentMode && (
            <Alert tone="info" title={t('agentPrompt.modeTitle')}>
              {t('agentPrompt.queuePageMessage')}
            </Alert>
          )}

          {!statusLoading && !isLlmConfigured && !agentMode && (
            <LlmSetupAlert
              titleKey="tailor.setupRequiredTitle"
              messageKey="tailor.noApiKeyMessage"
              actionKey="tailor.configureApiKey"
            />
          )}

          <div ref={descriptionRef}>
            <JobInput
              id="queue-job-description"
              value={jobDescriptionInput}
              onChange={setJobDescriptionInput}
              details={jobDetails}
              showJobId
              label={t('queue.form.jobDescriptionLabel')}
              hint={t('queue.form.jobDescriptionHint')}
              disabled={isAddingToQueue}
            />
          </div>

          {/* Master, intensity and cooldown: one line, opened when they need changing. */}
          <div className="border-y border-panel-hover py-3">
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 truncate font-mono text-xs text-ink-soft">{settingsSummary}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={settingsOpen}
                aria-controls="queue-settings"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                {settingsOpen ? t('common.close') : t('tailor.changeOptions')}
              </Button>
            </div>
            {settingsOpen && (
              <div id="queue-settings" className="mt-3 space-y-4">
                {masters.length > 1 && (
                  <Dropdown
                    label={t('tailor.selectResume')}
                    options={masters.map((m) => ({ id: m.resume_id, label: masterLabel(m) }))}
                    value={selectedResumeId}
                    onChange={setSelectedResumeId}
                    disabled={isAddingToQueue}
                  />
                )}
                <Dropdown
                  options={promptOptions.map((opt) => ({
                    id: opt.id,
                    label: t(`tailor.promptOptions.${opt.id}.label`),
                    description: t(`tailor.promptOptions.${opt.id}.description`),
                  }))}
                  value={selectedPromptId}
                  onChange={(value) => {
                    hasUserSelectedPrompt.current = true;
                    setSelectedPromptId(value);
                  }}
                  label={t('tailor.promptLabel')}
                  disabled={isAddingToQueue || promptLoading}
                />
                <div className="space-y-1">
                  <Label htmlFor="queue-cooldown">{t('queue.form.cooldownLabel')}</Label>
                  <Input
                    id="queue-cooldown"
                    type="number"
                    min={0}
                    max={MAX_COOLDOWN_SECONDS}
                    step={0.5}
                    aria-describedby="queue-cooldown-hint"
                    className="max-w-32 font-mono tabular-nums"
                    value={rateLimitSeconds}
                    onChange={(e) =>
                      setRateLimitSeconds(clampCooldown(Number.parseFloat(e.target.value)))
                    }
                    disabled={isAddingToQueue}
                  />
                  <p id="queue-cooldown-hint" className="text-xs text-steel">
                    {t('queue.form.cooldownHint')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <FadePresence show={!!queueError}>
            <Alert tone="error">{queueError}</Alert>
          </FadePresence>
          <FadePresence show={!!queueSuccessMessage}>
            <Alert tone="success">{queueSuccessMessage}</Alert>
          </FadePresence>

          <div className="flex justify-end">
            <Button
              onClick={agentMode ? () => setShowAgentPrompt(true) : handleAddToQueue}
              disabled={formDisabled || !jobDescriptionInput.trim()}
            >
              {isAddingToQueue ? (
                <>
                  <SpinnerGap className="animate-spin" aria-hidden="true" />
                  {t('queue.form.adding')}
                </>
              ) : statusLoading ? (
                <>
                  <SpinnerGap className="animate-spin" aria-hidden="true" />
                  {t('common.checking')}
                </>
              ) : agentMode ? (
                t('agentPrompt.getPrompt')
              ) : !isLlmConfigured ? (
                t('tailor.configureApiKeyFirst')
              ) : (
                t('queue.form.submit')
              )}
            </Button>
          </div>
          <AgentPromptDialog
            task={showAgentPrompt ? 'tailor' : null}
            resumeId={selectedResumeId}
            jobDescription={jobDescriptionInput}
            onClose={() => setShowAgentPrompt(false)}
          />
        </section>

        {/* The queue */}
        <section aria-labelledby="queue-list-heading" className="min-w-0 space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2
              id="queue-list-heading"
              className="font-mono text-xs font-bold uppercase tracking-wider text-ink-soft"
            >
              {t('queue.monitor.title')}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {updatedLabel && <span className="font-mono text-xs text-steel">{updatedLabel}</span>}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleRefresh}
                disabled={isRefreshingQueue}
                aria-label={t('queue.monitor.refresh')}
                title={t('queue.monitor.refresh')}
              >
                <ArrowsClockwise
                  className={isRefreshingQueue ? 'animate-spin' : undefined}
                  aria-hidden="true"
                />
              </Button>
              {queueItems.some((i) => i.status === 'completed') && (
                <Button variant="link" size="sm" onClick={handleClearCompleted}>
                  {t('queue.monitor.clearCompleted')}
                </Button>
              )}
              {queueItems.some((i) => i.status !== 'processing') && (
                <Button
                  variant="link"
                  size="sm"
                  className="text-destructive"
                  onClick={handleClearAll}
                >
                  {t('queue.monitor.clearAll')}
                </Button>
              )}
            </div>
          </div>

          <FadePresence show={!!actionError}>
            <Alert tone="error">{actionError}</Alert>
          </FadePresence>

          {queueLoad === 'error' && (
            <Alert tone="error" title={t('queue.errors.loadFailed')}>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleRefresh}
                disabled={isRefreshingQueue}
              >
                <ArrowsClockwise aria-hidden="true" />
                {t('common.retry')}
              </Button>
            </Alert>
          )}

          {queueItems.length === 0 ? (
            queueLoad === 'loading' ? (
              <p className="flex items-center gap-2 py-6 font-mono text-xs uppercase text-steel">
                <SpinnerGap className="animate-spin" aria-hidden="true" />
                {t('common.loading')}
              </p>
            ) : (
              queueLoad === 'ready' && (
                <EmptyState
                  variant="field"
                  title={t('queue.monitor.emptyTitle')}
                  description={t('queue.monitor.emptyDescription')}
                  className="min-h-64"
                />
              )
            )
          ) : (
            <ul className="divide-y divide-ink border border-ink bg-white">
              {queueItems.map((item) => (
                <QueueRow
                  key={item.item_id}
                  item={item}
                  place={placeInLine.get(item.item_id)}
                  locale={locale}
                  t={t}
                  onDelete={() => handleDeleteItem(item.item_id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

/** One job: its place in line while waiting, what it is, its status, and what to do. */
function QueueRow({
  item,
  place,
  locale,
  t,
  onDelete,
}: {
  item: QueueItem;
  /** Its place in line, counted from the oldest waiting job; only while waiting. */
  place?: number;
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  onDelete: () => void;
}) {
  const title = item.title || item.role || t('queue.monitor.untitled');
  const failure = item.error && FAILURE_CODES.has(item.error) ? item.error : 'failed';
  const meta = [
    item.company,
    item.job_req_id && t('queue.monitor.jobId', { id: item.job_req_id }),
    formatDate(item.created_at, locale),
  ].filter(Boolean);
  return (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]">
      <span
        aria-hidden={place === undefined}
        className="font-serif text-2xl font-bold leading-none tabular-nums text-ink"
      >
        {place !== undefined && String(place).padStart(2, '0')}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-mono text-sm font-bold break-words text-ink">{title}</p>
        <p className="font-mono text-xs text-steel">{meta.join(' · ')}</p>
        {!item.role && !item.title && (
          <p className="truncate text-sm text-ink-soft">{item.job_description_snippet}</p>
        )}
        {item.status === 'failed' && (
          <p className="text-sm text-destructive">{t(`queue.errors.item.${failure}`)}</p>
        )}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-3 sm:col-start-3 sm:row-start-1 sm:justify-end">
        <StatusIndicator tone={STATUS_TONE[item.status]}>
          {item.status === 'processing' && (
            <SpinnerGap className="mr-1 inline size-3 animate-spin" aria-hidden="true" />
          )}
          {t(`queue.status.${item.status}`)}
        </StatusIndicator>
        {item.status === 'pending' && item.rate_limit_seconds > 0 && (
          <span className="font-mono text-xs text-steel">
            {t('queue.monitor.cooldown', { seconds: item.rate_limit_seconds })}
          </span>
        )}
        {item.status === 'completed' && item.tailored_resume_id && (
          <Link
            href={`/resumes/${item.tailored_resume_id}`}
            className={buttonClass({ variant: 'outline', size: 'sm' })}
          >
            {t('queue.monitor.viewResume')}
          </Link>
        )}
        {item.status !== 'processing' && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={t('queue.monitor.remove')}
            title={t('queue.monitor.remove')}
          >
            <Trash aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
  );
}
