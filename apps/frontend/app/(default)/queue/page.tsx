'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowsClockwise, SpinnerGap, Trash } from '@phosphor-icons/react';
import {
  fetchResumeList,
  fetchJobQueue,
  addJobToQueue,
  deleteQueueItem,
  clearQueueItems,
  parseJobMetadata,
  QueueItemInProgressError,
  type QueueItem,
  type QueueItemStatus,
  type ResumeListItem,
} from '@/lib/api/resume';
import { fetchPromptConfig, type PromptOption } from '@/lib/api/config';
import { useStatusCache } from '@/lib/context/status-cache';
import { useTranslations } from '@/lib/i18n';
import { formatDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label, labelClass } from '@/components/ui/label';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';
import { PanelHeader } from '@/components/ui/panel-header';
import { StatusIndicator, type StatusTone } from '@/components/ui/status-indicator';
import { Textarea } from '@/components/ui/textarea';
import { LlmSetupAlert } from '@/components/common/llm-setup-alert';
import { AgentPromptDialog } from '@/components/agent/agent-prompt-dialog';
import { FadePresence } from '@/components/common/presence';

const MIN_JOB_DESCRIPTION_LENGTH = 50;
const POLL_INTERVAL_MS = 2500;
const DETECT_DELAY_MS = 300;
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
  const [roleInput, setRoleInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [jobReqIdInput, setJobReqIdInput] = useState('');
  // Fields the user typed into; detection only fills the others.
  const userEdited = useRef(new Set<'role' | 'company' | 'jobReqId'>());
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number>(5);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
    (async () => {
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

  // Detect role, company and job ID on the server's heuristics (no AI call).
  // Detected values replace earlier detections, including with "nothing found",
  // so a previous job's company never sticks to the next description.
  useEffect(() => {
    const applyDetected = (role: string, company: string, jobReqId: string) => {
      const edited = userEdited.current;
      if (!edited.has('role')) setRoleInput(role);
      if (!edited.has('company')) setCompanyInput(company);
      if (!edited.has('jobReqId')) setJobReqIdInput(jobReqId);
    };
    const text = jobDescriptionInput.trim();
    if (!text) {
      applyDetected('', '', '');
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const parsed = await parseJobMetadata(text);
        if (cancelled) return;
        applyDetected(parsed.role, parsed.company, parsed.job_req_id);
      } catch (err) {
        console.error('Failed to detect job details', err);
      }
    }, DETECT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobDescriptionInput]);

  const editField = (
    field: 'role' | 'company' | 'jobReqId',
    value: string,
    setValue: (value: string) => void
  ) => {
    setValue(value);
    if (value.trim()) userEdited.current.add(field);
    else userEdited.current.delete(field);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };

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
    loadQueue();
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
        roleInput.trim() || undefined,
        companyInput.trim() || undefined,
        jobReqIdInput.trim() || undefined,
        selectedPromptId
      );
      queueRequest.current++;
      setQueueItems((prev) => [newItem, ...prev.filter((i) => i.item_id !== newItem.item_id)]);
      setJobDescriptionInput('');
      userEdited.current.clear();
      setRoleInput('');
      setCompanyInput('');
      setJobReqIdInput('');
      setQueueSuccessMessage(t('queue.form.added'));
      incrementJobs();
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
        loadQueue();
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

  return (
    <PageFrame>
      <PageHeader>
        <PageHeader.Back href="/dashboard">{t('common.back')}</PageHeader.Back>
        <PageHeader.Title>{t('queue.title')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('queue.subtitle')}</PageHeader.Subtitle>
      </PageHeader>

      <div className="grid gap-8 p-6 md:p-8 lg:grid-cols-2">
        {/* Add a job */}
        <section className="space-y-4">
          <PanelHeader tone="input" title={t('queue.form.title')} />

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

          <div className="grid gap-4 sm:grid-cols-2">
            {masters.length > 1 ? (
              <Dropdown
                label={t('tailor.selectResume')}
                description={t('queue.form.masterDescription')}
                options={masters.map((m) => ({ id: m.resume_id, label: masterLabel(m) }))}
                value={selectedResumeId}
                onChange={setSelectedResumeId}
                disabled={isAddingToQueue}
              />
            ) : (
              <div className="space-y-1">
                <span className={cn('block', labelClass)}>{t('tailor.selectResume')}</span>
                <p className="text-sm text-ink-soft">{t('queue.form.masterDescription')}</p>
                <p className="flex min-h-10 items-center font-mono text-sm font-bold break-words text-ink">
                  {resumesLoading
                    ? t('common.loading')
                    : masters.length === 1
                      ? masterLabel(masters[0])
                      : t('queue.form.noMaster')}
                </p>
              </div>
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
              description={t('tailor.promptDescription')}
              disabled={isAddingToQueue || promptLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="queue-job-description">{t('queue.form.jobDescriptionLabel')}</Label>
            <Textarea
              id="queue-job-description"
              aria-describedby="queue-job-description-hint"
              placeholder={t('tailor.jobDescriptionPlaceholder')}
              className="min-h-48 resize-none p-4"
              value={jobDescriptionInput}
              onChange={(e) => setJobDescriptionInput(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              disabled={isAddingToQueue}
            />
            <p id="queue-job-description-hint" className="text-sm text-ink-soft">
              {t('queue.form.jobDescriptionHint')}
            </p>
          </div>

          <fieldset className="space-y-3 border border-ink bg-white p-4 shadow-sw-nested">
            <legend className={cn('px-1', labelClass)}>{t('queue.form.detectedTitle')}</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="queue-role">{t('queue.form.roleLabel')}</Label>
                <Input
                  id="queue-role"
                  placeholder={t('queue.form.rolePlaceholder')}
                  value={roleInput}
                  onChange={(e) => editField('role', e.target.value, setRoleInput)}
                  disabled={isAddingToQueue}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="queue-company">{t('queue.form.companyLabel')}</Label>
                <Input
                  id="queue-company"
                  placeholder={t('queue.form.companyPlaceholder')}
                  value={companyInput}
                  onChange={(e) => editField('company', e.target.value, setCompanyInput)}
                  disabled={isAddingToQueue}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="queue-job-id">{t('queue.form.jobReqIdLabel')}</Label>
                <Input
                  id="queue-job-id"
                  placeholder={t('common.optional')}
                  value={jobReqIdInput}
                  onChange={(e) => editField('jobReqId', e.target.value, setJobReqIdInput)}
                  disabled={isAddingToQueue}
                />
              </div>
            </div>
          </fieldset>

          <div className="space-y-2">
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
              onChange={(e) => setRateLimitSeconds(clampCooldown(parseFloat(e.target.value)))}
              disabled={isAddingToQueue}
            />
            <p id="queue-cooldown-hint" className="text-sm text-ink-soft">
              {t('queue.form.cooldownHint')}
            </p>
          </div>

          <FadePresence show={!!queueError}>
            <Alert tone="error">{queueError}</Alert>
          </FadePresence>
          <FadePresence show={!!queueSuccessMessage}>
            <Alert tone="success">{queueSuccessMessage}</Alert>
          </FadePresence>

          <Button
            size="lg"
            className="w-full"
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
          <AgentPromptDialog
            task={showAgentPrompt ? 'tailor' : null}
            resumeId={selectedResumeId}
            jobDescription={jobDescriptionInput}
            onClose={() => setShowAgentPrompt(false)}
          />
        </section>

        {/* Queue monitor */}
        <section className="min-w-0 space-y-4">
          <PanelHeader tone="output" title={t('queue.monitor.title')}>
            <span className="font-mono text-xs tabular-nums text-steel">
              {t('queue.monitor.count', { count: queueItems.length })}
            </span>
          </PanelHeader>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshingQueue}
            >
              <ArrowsClockwise
                className={isRefreshingQueue ? 'animate-spin' : undefined}
                aria-hidden="true"
              />
              {t('queue.monitor.refresh')}
            </Button>
            {queueItems.some((i) => i.status === 'completed') && (
              <Button variant="outline" size="sm" onClick={handleClearCompleted}>
                {t('queue.monitor.clearCompleted')}
              </Button>
            )}
            {queueItems.some((i) => i.status !== 'processing') && (
              <Button variant="outline-destructive" size="sm" onClick={handleClearAll}>
                {t('queue.monitor.clearAll')}
              </Button>
            )}
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
                  variant="framed"
                  title={t('queue.monitor.emptyTitle')}
                  description={t('queue.monitor.emptyDescription')}
                />
              )
            )
          ) : (
            <ul className="space-y-3">
              {queueItems.map((item) => (
                <QueueRow
                  key={item.item_id}
                  item={item}
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

function QueueRow({
  item,
  locale,
  t,
  onDelete,
}: {
  item: QueueItem;
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  onDelete: () => void;
}) {
  const title = item.title || item.role || t('queue.monitor.untitled');
  const failure = item.error && FAILURE_CODES.has(item.error) ? item.error : 'failed';
  return (
    <li className="space-y-2 border border-ink bg-white p-4 shadow-sw-nested">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-sm font-bold break-words text-ink">{title}</p>
          {(item.company || item.job_req_id) && (
            <p className="font-mono text-xs text-steel">
              {[item.company, item.job_req_id && t('queue.monitor.jobId', { id: item.job_req_id })]
                .filter(Boolean)
                .join(' / ')}
            </p>
          )}
        </div>
        <StatusIndicator tone={STATUS_TONE[item.status]}>
          {item.status === 'processing' && (
            <SpinnerGap className="mr-1 inline size-3 animate-spin" aria-hidden="true" />
          )}
          {t(`queue.status.${item.status}`)}
        </StatusIndicator>
      </div>

      <p className="truncate text-sm text-ink-soft">{item.job_description_snippet}</p>

      {item.status === 'failed' && (
        <p className="text-sm text-destructive">{t(`queue.errors.item.${failure}`)}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xs text-steel">{formatDate(item.created_at, locale)}</span>
        <div className="flex items-center gap-3">
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
      </div>
    </li>
  );
}
