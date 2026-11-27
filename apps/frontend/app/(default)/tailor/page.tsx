'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonClass } from '@/components/ui/button';
import { labelClass } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { PageFrame } from '@/components/ui/page-frame';
import { LlmSetupAlert } from '@/components/common/llm-setup-alert';
import { AgentPromptDialog } from '@/components/agent/agent-prompt-dialog';
import { FadePresence } from '@/components/common/presence';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import type { ATSScore, ImprovedResult } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { JobInput, MIN_JOB_DESCRIPTION_LENGTH } from '@/components/jobs/job-input';
import { useJobDetails } from '@/hooks/use-job-details';
import { toast } from '@/components/ui/toast';
import {
  addJobToQueue,
  uploadJobDescriptions,
  previewImproveResume,
  confirmImproveResume,
  applyKeywords,
  fetchResumeList,
  toPageFitSettings,
  type ForcedKeywordInput,
  type ResumeListItem,
} from '@/lib/api/resume';
import { tailorBlock } from '@/lib/tailor/readiness';
import { ApiError } from '@/lib/api/client';
import { newProgressId, subscribeToProgress } from '@/lib/api/progress';
import type { WritingReport } from '@/lib/api/writing';
import { keywordInText, resumeKeywordText } from '@/lib/utils/keyword-matcher';
import {
  DEFAULT_TAILOR_LENGTH,
  TAILOR_BULLET_CAPS,
  TAILOR_PAGE_LIMITS,
  buildPreviewLengthOptions,
  readTailorLength,
  writeTailorLength,
  type TailorBulletCap,
  type TailorLengthSettings,
  type TailorPageLimit,
} from '@/lib/utils/tailor-length-settings';
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateType } from '@/lib/types/template-settings';
import { fetchPromptConfig, type PromptOption } from '@/lib/api/config';
import { getPreviewErrorMessage } from '@/lib/utils/preview-error';
import { Dropdown } from '@/components/ui/dropdown';
import { useStatusCache } from '@/lib/context/status-cache';
import { ArrowLeft, ListNumbers, SpinnerGap } from '@phosphor-icons/react';
import { useTranslations } from '@/lib/i18n';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import { ATSScoreCard } from '@/components/tailor/ats-score-card';
import {
  KeywordForcingPanel,
  MAX_FORCED_KEYWORDS,
} from '@/components/tailor/keyword-forcing-panel';
import { TailorProgress } from '@/components/tailor/tailor-progress';
import { WritingScoreCard } from '@/components/tailor/writing-score-card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useOperationOwner } from '@/hooks/use-operation-owner';
import { cn } from '@/lib/utils';

const masterLabel = (m: ResumeListItem) => m.title || m.filename || m.resume_id;

/** An option row: its label on the left, its control on the right (stacked on a phone). */
const OPTION_ROW_INNER = 'grid items-center gap-x-4 gap-y-1 space-y-0 sm:grid-cols-[9rem_1fr]';
const OPTION_ROW = cn(OPTION_ROW_INNER, 'py-3');

export default function TailorPage() {
  const { t, locale } = useTranslations();
  const { begin, isCurrent, invalidate } = useOperationOwner('tailor');
  const confirmedResponses = useRef(new WeakMap<ImprovedResult, ImprovedResult>());
  const countedResumes = useRef(new Set<string>());
  const confirmationBusy = useRef(false);
  const [jobDescription, setJobDescription] = useState('');
  const jobDetails = useJobDetails(jobDescription);
  const [isQueueing, setIsQueueing] = useState(false);
  // After a run the score cards take the options' place; the options fold to one line.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [masters, setMasters] = useState<ResumeListItem[]>([]);
  // The list of masters couldn't load: the stored master is used, unnamed.
  const [mastersFailed, setMastersFailed] = useState(false);
  // The master a preview was built from; confirm must send this, not the picker's current value.
  const previewSourceIdRef = useRef<string | null>(null);
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState('keywords');
  const [promptLoading, setPromptLoading] = useState(false);
  const hasUserSelectedPrompt = useRef(false);
  const missingDiffConfirmInFlight = useRef(false);

  // Diff preview modal state
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [pendingResult, setPendingResult] = useState<ImprovedResult | null>(null);
  // The last ATS result stays visible after the diff modal closes; cleared when a new run starts.
  const [atsResult, setAtsResult] = useState<ATSScore | null>(null);
  // Template the preview was fitted with; the ATS card warns on two-column layouts.
  const [atsTemplate, setAtsTemplate] = useState<TemplateType | undefined>(undefined);
  // ATS score before the last keyword apply; the card shows it as "was".
  const [atsPrevious, setAtsPrevious] = useState<number | undefined>(undefined);
  // Writing critique of the last preview, and the resume its paths point into.
  const [writingResult, setWritingResult] = useState<WritingReport | null>(null);
  const [writingResume, setWritingResume] = useState<ResumeData | null>(null);
  // Live stage of the running preview (null until the first update).
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  // Keywords forced into the pending preview, and the confirmed ones to add to the master.
  const [forcedKeywords, setForcedKeywords] = useState<string[]>([]);
  const [masterSkillsToAdd, setMasterSkillsToAdd] = useState<string[]>([]);
  const [keywordBusy, setKeywordBusy] = useState(false);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [diffConfirmError, setDiffConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showMissingDiffDialog, setShowMissingDiffDialog] = useState(false);
  const [missingDiffResult, setMissingDiffResult] = useState<ImprovedResult | null>(null);
  // Page limit / bullet cap for tailoring; loaded from storage after mount.
  const [tailorLength, setTailorLength] = useState<TailorLengthSettings>(DEFAULT_TAILOR_LENGTH);

  useEffect(() => {
    setTailorLength(readTailorLength());
  }, []);

  const updateTailorLength = (patch: Partial<TailorLengthSettings>) => {
    const next = { ...tailorLength, ...patch };
    setTailorLength(next);
    writeTailorLength(next);
  };
  const [missingDiffError, setMissingDiffError] = useState<string | null>(null);

  // Elapsed timer for long operations
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setElapsed(0);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const router = useRouter();
  const { setImprovedData } = useResumePreview();
  const {
    status: systemStatus,
    isLoading: statusLoading,
    incrementJobs,
    incrementImprovements,
    incrementResumes,
  } = useStatusCache();

  // Check if LLM is configured
  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;
  // Agent mode: the user's coding agent tailors; the button shows a prompt for it.
  const agentMode = !statusLoading && Boolean(systemStatus?.agent_mode);
  const [showAgentPrompt, setShowAgentPrompt] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const rows = await fetchResumeList(true);
        if (cancelled) return;
        const ready = rows.filter((r) => r.is_master && r.processing_status === 'ready');
        const storedId = localStorage.getItem('master_resume_id');
        const initial =
          ready.find((r) => r.is_default_master) ??
          ready.find((r) => r.resume_id === storedId) ??
          ready[0];
        if (!initial) {
          router.push('/dashboard');
          return;
        }
        setMasters(ready);
        setMasterResumeId(initial.resume_id);
      } catch {
        if (cancelled) return;
        setMastersFailed(true);
        const storedId = localStorage.getItem('master_resume_id');
        if (storedId) setMasterResumeId(storedId);
        else router.push('/dashboard');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const loadPromptConfig = async () => {
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
        if (!cancelled) {
          setPromptLoading(false);
        }
      }
    };

    void loadPromptConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildConfirmPayload = (result: ImprovedResult) => {
    const sourceId = previewSourceIdRef.current ?? masterResumeId;
    if (!sourceId) {
      throw new Error('Master resume ID is missing.');
    }
    const resumePreview = result.data.resume_preview;
    if (!resumePreview || typeof resumePreview !== 'object' || Array.isArray(resumePreview)) {
      throw new Error('Resume preview data is invalid.');
    }
    const previewRecord = resumePreview as unknown as Record<string, unknown>;
    if (
      !previewRecord.personalInfo ||
      typeof previewRecord.personalInfo !== 'object' ||
      Array.isArray(previewRecord.personalInfo)
    ) {
      throw new Error('Resume preview data is invalid.');
    }
    return {
      resume_id: sourceId,
      job_id: result.data.job_id,
      preview_id: result.data.preview_id ?? null,
      improved_data: resumePreview as ResumeData,
      improvements:
        result.data.improvements?.map((item) => ({
          suggestion: item.suggestion,
          lineNumber: typeof item.lineNumber === 'number' ? item.lineNumber : null,
        })) ?? [],
      forced_keywords: forcedKeywords,
      master_skills_to_add: masterSkillsToAdd,
    };
  };

  const resetKeywordState = () => {
    setForcedKeywords([]);
    setMasterSkillsToAdd([]);
    setAtsPrevious(undefined);
    setKeywordError(null);
    setKeywordBusy(false);
  };

  const confirmAndNavigate = async (result: ImprovedResult, token: number) => {
    let confirmed = confirmedResponses.current.get(result);
    if (!confirmed) {
      const expiresAt = Date.parse(result.data.preview_expires_at ?? '');
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        throw new Error('Preview expired');
      }
      confirmed = await confirmImproveResume(buildConfirmPayload(result));
      // Acknowledgement is durable even if a later client effect fails.
      confirmedResponses.current.set(result, confirmed);
    }
    if (!isCurrent(token)) return;
    const newResumeId = confirmed?.data?.resume_id;
    if (newResumeId && !countedResumes.current.has(newResumeId)) {
      countedResumes.current.add(newResumeId);
      incrementImprovements();
      incrementResumes();
    }
    setImprovedData(confirmed);
    router.push(newResumeId ? `/resumes/${newResumeId}` : '/builder');
  };

  const offerFreshPreview = (failure: unknown): boolean => {
    // A 400 or 409 from confirm or apply-keywords means the preview no longer
    // matches its resume and job; the server says so in words, not a status code.
    const stale =
      (failure instanceof ApiError && (failure.status === 400 || failure.status === 409)) ||
      (failure instanceof Error && /preview expired/i.test(failure.message));
    if (!stale) return false;
    invalidate();
    confirmationBusy.current = false;
    missingDiffConfirmInFlight.current = false;
    setIsConfirming(false);
    setIsLoading(false);
    setShowDiffModal(false);
    setShowMissingDiffDialog(false);
    setPendingResult(null);
    setMissingDiffResult(null);
    setDiffConfirmError(null);
    setMissingDiffError(null);
    setError(t('tailor.errors.previewUnavailable'));
    setShowRegenerateDialog(true);
    return true;
  };

  /**
   * The job to send and the master to tailor, or null: one rule for Generate,
   * Regenerate and Add to queue. A description too short to tailor from says so.
   */
  const jobToSend = (): { resumeId: string; description: string } | null => {
    const description = jobDescription.trim();
    if (!description || !masterResumeId) return null;
    if (description.length < MIN_JOB_DESCRIPTION_LENGTH) {
      setError(t('tailor.errors.jobDescriptionTooShort'));
      return null;
    }
    return { resumeId: masterResumeId, description };
  };

  const runGenerate = async (resumeId: string, description: string, token: number) => {
    setAtsResult(null);
    setWritingResult(null);
    setWritingResume(null);
    resetKeywordState();
    setProgressStage(null);
    setIsGenerating(true);
    const progressId = newProgressId();
    const stopProgress = subscribeToProgress(progressId, (stage) => {
      if (isCurrent(token)) setProgressStage(stage);
    });
    try {
      // 1. Upload Job Description
      // The API expects an array of strings
      previewSourceIdRef.current = resumeId;
      // What the user typed into Role and Company goes with the job, so the tracker
      // card keeps it; detected values are left for the server's own extraction.
      const typed = jobDetails.current();
      const jobId = await uploadJobDescriptions([description], resumeId, {
        role: jobDetails.isEdited('role') ? typed.role : undefined,
        company: jobDetails.isEdited('company') ? typed.company : undefined,
      });
      if (!isCurrent(token)) return;
      incrementJobs(); // Update cached counter

      // 2. Preview Resume
      // Fit pages the way the source resume is formatted.
      const templateSettings =
        masters.find((m) => m.resume_id === resumeId)?.template_settings ??
        DEFAULT_TEMPLATE_SETTINGS;
      const result = await previewImproveResume(resumeId, jobId, selectedPromptId, {
        ...buildPreviewLengthOptions(tailorLength, toPageFitSettings(templateSettings, locale)),
        progressId,
      });
      if (!isCurrent(token)) return;

      if (!result?.data?.diff_summary || !result?.data?.detailed_changes) {
        console.warn('Diff data missing for tailor preview; requesting user confirmation.');
        setDiffConfirmError(null);
        setPendingResult(null);
        setShowDiffModal(false);
        setMissingDiffError(null);
        setMissingDiffResult(result);
        setShowMissingDiffDialog(true);
        return;
      }

      // 3. Show diff preview modal
      setDiffConfirmError(null);
      setMissingDiffError(null);
      setPendingResult(result);
      setAtsResult(result.data.ats_score ?? null);
      setAtsTemplate(templateSettings.template);
      setWritingResult(result.data.writing ?? null);
      setWritingResume((result.data.resume_preview as ResumeData) ?? null);
      setShowDiffModal(true);
    } catch (err) {
      if (!isCurrent(token)) return;
      console.error(err);
      setError(getPreviewErrorMessage(err, t));
    } finally {
      stopProgress();
      if (isCurrent(token)) setIsGenerating(false);
    }
  };

  // Work chosen keywords into the pending preview; the result replaces it.
  const handleApplyKeywords = async (keywords: ForcedKeywordInput[], addToMaster: boolean) => {
    const current = pendingResult;
    const sourceId = previewSourceIdRef.current;
    if (!current?.data.preview_id || !sourceId || keywordBusy || confirmationBusy.current) return;
    const token = begin();
    if (token === null) return;
    setKeywordBusy(true);
    setKeywordError(null);
    try {
      const next = await applyKeywords({
        resume_id: sourceId,
        job_id: current.data.job_id,
        preview_id: current.data.preview_id,
        improved_data: current.data.resume_preview as ResumeData,
        keywords,
        prompt_id: selectedPromptId,
      });
      if (!isCurrent(token)) return;
      const placed = next.data.forced_keywords ?? [];
      const attested = new Set(keywords.filter((k) => k.attested).map((k) => k.keyword));
      setForcedKeywords((prev) => [...new Set([...prev, ...placed])]);
      if (addToMaster) {
        setMasterSkillsToAdd((prev) => [
          ...new Set([...prev, ...placed.filter((k) => attested.has(k))]),
        ]);
      }
      setAtsPrevious(atsResult?.overall_score);
      setAtsResult(next.data.ats_score ?? null);
      if (next.data.writing) {
        setWritingResult({
          ...next.data.writing,
          critic_notes: writingResult?.critic_notes ?? [],
          rewritten_paths: writingResult?.rewritten_paths ?? [],
          rejected_rewrites: writingResult?.rejected_rewrites ?? 0,
        });
      }
      setWritingResume((next.data.resume_preview as ResumeData) ?? null);
      // Earlier applications stay listed: their keywords are still in the resume.
      const latest = next.data.keyword_placements ?? [];
      const earlier = (current.data.keyword_placements ?? []).filter(
        (p) => !latest.some((n) => n.keyword === p.keyword)
      );
      setPendingResult({
        ...next,
        data: { ...next.data, keyword_placements: [...earlier, ...latest] },
      });
    } catch (err) {
      if (!isCurrent(token)) return;
      console.error(err);
      if (offerFreshPreview(err)) return;
      setKeywordError(t('tailor.forceKeywords.error'));
    } finally {
      if (isCurrent(token)) setKeywordBusy(false);
    }
  };

  const handleGenerate = async () => {
    const job = jobToSend();
    if (!job) return;
    const token = begin();
    if (token === null) return;
    setIsLoading(true);
    setError(null);
    startTimer();
    try {
      await runGenerate(job.resumeId, job.description, token);
    } finally {
      if (isCurrent(token)) {
        setIsLoading(false);
        stopTimer();
      }
    }
  };

  // User confirms changes
  const handleConfirmChanges = async () => {
    if (!pendingResult || confirmationBusy.current || keywordBusy) return;
    const token = begin();
    if (token === null) return;
    confirmationBusy.current = true;

    setIsConfirming(true);
    setError(null);
    setDiffConfirmError(null);

    try {
      await confirmAndNavigate(pendingResult, token);
      if (!isCurrent(token)) return;
      setShowDiffModal(false);
      setPendingResult(null);
    } catch (err) {
      if (!isCurrent(token)) return;
      console.error(err);
      if (offerFreshPreview(err)) return;
      const errorMessage = t('tailor.errors.failedToConfirm');
      setError(errorMessage);
      setDiffConfirmError(errorMessage);
    } finally {
      if (isCurrent(token)) {
        confirmationBusy.current = false;
        setIsConfirming(false);
      }
    }
  };

  // User rejects changes
  const handleRejectChanges = () => {
    if (confirmationBusy.current) return;
    invalidate();
    resetKeywordState();
    confirmationBusy.current = false;
    setIsConfirming(false);
    setShowDiffModal(false);
    setPendingResult(null);
    setDiffConfirmError(null);
    setShowRegenerateDialog(true);
  };

  const handleCloseDiffModal = () => {
    if (confirmationBusy.current) return;
    invalidate();
    resetKeywordState();
    confirmationBusy.current = false;
    setIsConfirming(false);
    setShowDiffModal(false);
    setPendingResult(null);
    setDiffConfirmError(null);
  };

  const handleCloseMissingDiffDialog = () => {
    invalidate();
    setIsLoading(false);
    setShowMissingDiffDialog(false);
    setMissingDiffResult(null);
    setMissingDiffError(null);
    missingDiffConfirmInFlight.current = false;
  };

  const handleMissingDiffConfirm = async () => {
    if (!missingDiffResult || isLoading || missingDiffConfirmInFlight.current) return;
    const token = begin();
    if (token === null) return;
    missingDiffConfirmInFlight.current = true;
    setIsLoading(true);
    setError(null);
    setMissingDiffError(null);
    try {
      await confirmAndNavigate(missingDiffResult, token);
      if (!isCurrent(token)) return;
      handleCloseMissingDiffDialog();
    } catch (err) {
      if (!isCurrent(token)) return;
      console.error(err);
      if (offerFreshPreview(err)) return;
      const errorMessage = t('tailor.errors.failedToConfirm');
      setError(errorMessage);
      setMissingDiffError(errorMessage);
    } finally {
      if (isCurrent(token)) {
        missingDiffConfirmInFlight.current = false;
        setIsLoading(false);
      }
    }
  };

  const handleRegenerateConfirm = async () => {
    setShowRegenerateDialog(false);
    await handleGenerate();
  };

  // Missing keywords the pending preview still lacks (forced ones drop off the chips).
  const previewText = pendingResult?.data?.resume_preview
    ? resumeKeywordText(pendingResult.data.resume_preview as ResumeData)
    : '';
  const unplacedKeywords = (keywords: string[]) =>
    keywords.filter((k) => !forcedKeywords.includes(k) && !keywordInText(k, previewText));

  // Hand the job to the background queue instead of waiting here. Same rules as
  // Generate: a master, and a description long enough to tailor from.
  const handleAddToQueue = async () => {
    const job = jobToSend();
    if (!job) return;
    setIsQueueing(true);
    setError(null);
    try {
      const details = jobDetails.current();
      // The queue's own default cooldown, as the queue page starts with.
      await addJobToQueue(
        job.resumeId,
        job.description,
        undefined,
        details.role || undefined,
        details.company || undefined,
        details.jobReqId || undefined,
        selectedPromptId
      );
      incrementJobs();
      setJobDescription('');
      jobDetails.reset();
      toast.success(t('tailor.queued'));
    } catch (err) {
      console.error('Failed to add job to queue', err);
      setError(t('queue.errors.addFailed'));
    } finally {
      setIsQueueing(false);
    }
  };

  const intensityOptions =
    promptOptions.length > 0
      ? promptOptions.map((opt) => opt.id)
      : ['nudge', 'keywords', 'full', 'heavy'];

  const block = tailorBlock({
    busy: isLoading || isQueueing,
    statusLoading,
    modelReady: isLlmConfigured || agentMode,
    hasMaster: Boolean(masterResumeId),
    hasJob: Boolean(jobDescription.trim()),
  });
  const generateDisabled = block !== null;
  // Why Generate is grey, said beside it. Busy, loading and no model need no line:
  // the button's own label says so.
  const blockedReason =
    block === 'noMaster'
      ? t('tailor.blocked.noMaster')
      : block === 'noJob'
        ? t('tailor.blocked.noJob')
        : null;
  // A queued job is tailored without the page limit and bullet cap (the queue
  // doesn't carry them), so say so rather than drop them silently.
  const queueIgnoresLength =
    !agentMode && (tailorLength.maxPages != null || tailorLength.maxBulletsPerEntry != null);
  const hasResults = Boolean(atsResult || writingResult);
  const showOptions = !isGenerating && (!hasResults || optionsOpen);
  const masterName = masters.find((m) => m.resume_id === masterResumeId);
  const optionsSummary = [
    masterName ? masterLabel(masterName) : null,
    t(`tailor.promptOptions.${selectedPromptId}.label`),
    t(`tailor.length.pageLimitOptions.${tailorLength.maxPages ?? 'none'}`),
    tailorLength.maxBulletsPerEntry != null
      ? `${t('tailor.length.bulletsLabel')}: ${t(`tailor.length.bulletOptions.${tailorLength.maxBulletsPerEntry}`)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PageFrame width="card" height="screen-md" ground="crosses" className="md:h-full">
      {/* One compact toolbar row, as on the viewer, tracker and settings. */}
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
          {t('tailor.heroTitle')}
        </h1>
        <Link
          href="/queue"
          className={buttonClass({ variant: 'outline', size: 'sm', className: 'ml-auto' })}
        >
          <ListNumbers aria-hidden="true" />
          {t('nav.queue')}
        </Link>
      </header>

      {/* The card is one column: the job, then the options (or progress, or
          results), then the action bar. On a short window the column scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {(agentMode || (!statusLoading && !isLlmConfigured)) && (
          <div className="space-y-3 px-6 pt-6">
            {agentMode && (
              <Alert tone="info" title={t('agentPrompt.modeTitle')}>
                {t('agentPrompt.tailorPageMessage')}
              </Alert>
            )}
            {!statusLoading && !isLlmConfigured && !agentMode && (
              <LlmSetupAlert
                titleKey="tailor.setupRequiredTitle"
                messageKey="tailor.noApiKeyMessage"
                actionKey="tailor.configureApiKey"
              />
            )}
          </div>
        )}

        <JobInput
          id="job-description"
          value={jobDescription}
          onChange={setJobDescription}
          details={jobDetails}
          disabled={isLoading || isQueueing}
          className="min-h-[24rem] flex-1 p-6"
        />

        <section aria-labelledby="tailor-options-heading" className="shrink-0 border-t border-ink">
          <h2 id="tailor-options-heading" className="sr-only">
            {t('tailor.optionsTitle')}
          </h2>

          {isGenerating && (
            <div className="p-6">
              <TailorProgress
                stage={progressStage}
                elapsed={elapsed}
                withSelection={
                  tailorLength.maxPages != null || tailorLength.maxBulletsPerEntry != null
                }
                withRewrite={selectedPromptId !== 'nudge'}
              />
            </div>
          )}

          {!isGenerating && hasResults && (
            <div className="flex items-center justify-between gap-4 border-b border-ink px-6 py-3">
              <p className="min-w-0 truncate font-mono text-xs text-ink-soft">{optionsSummary}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={optionsOpen}
                onClick={() => setOptionsOpen((open) => !open)}
              >
                {optionsOpen ? t('common.close') : t('tailor.changeOptions')}
              </Button>
            </div>
          )}

          {showOptions && (
            <div className="divide-y divide-panel-hover px-6">
              {masters.length > 1 ? (
                <Dropdown
                  label={t('tailor.selectResume')}
                  options={masters.map((m) => ({ id: m.resume_id, label: masterLabel(m) }))}
                  value={masterResumeId ?? ''}
                  onChange={setMasterResumeId}
                  disabled={isLoading || promptLoading || showDiffModal}
                  className={OPTION_ROW}
                />
              ) : mastersFailed ? null : (
                <div className={OPTION_ROW}>
                  <span className={cn('block', labelClass)}>{t('tailor.tailoringLabel')}</span>
                  <p className="flex min-h-10 items-center font-mono text-sm font-bold break-words text-ink">
                    {masters.length === 1 ? masterLabel(masters[0]) : t('common.loading')}
                  </p>
                </div>
              )}

              <div className="py-3">
                <Dropdown
                  label={t('tailor.promptLabel')}
                  options={intensityOptions.map((id) => ({
                    id,
                    label: t(`tailor.promptOptions.${id}.label`),
                    description: t(`tailor.promptOptions.${id}.description`),
                  }))}
                  value={selectedPromptId}
                  onChange={(value) => {
                    hasUserSelectedPrompt.current = true;
                    setSelectedPromptId(value);
                  }}
                  disabled={isLoading || promptLoading}
                  className={OPTION_ROW_INNER}
                />
                {/* One line of help, for the option chosen, not a paragraph per field. */}
                <p className="mt-1 text-xs text-steel sm:pl-40">
                  {t(`tailor.promptOptions.${selectedPromptId}.description`)}
                </p>
                <FadePresence show={selectedPromptId === 'heavy'}>
                  <Alert tone="warning" className="mt-3">
                    {t('tailor.heavyWarning')}
                  </Alert>
                </FadePresence>
              </div>

              <Dropdown
                label={t('tailor.length.pageLimitLabel')}
                options={TAILOR_PAGE_LIMITS.map((limit) => ({
                  id: String(limit ?? 'none'),
                  label: t(`tailor.length.pageLimitOptions.${limit ?? 'none'}`),
                }))}
                value={String(tailorLength.maxPages ?? 'none')}
                onChange={(value) =>
                  updateTailorLength({
                    maxPages: (value === 'none' ? null : Number(value)) as TailorPageLimit,
                  })
                }
                disabled={isLoading}
                className={OPTION_ROW}
              />
              <Dropdown
                label={t('tailor.length.bulletsLabel')}
                options={TAILOR_BULLET_CAPS.map((cap) => ({
                  id: String(cap ?? 'all'),
                  label: t(`tailor.length.bulletOptions.${cap ?? 'all'}`),
                }))}
                value={String(tailorLength.maxBulletsPerEntry ?? 'all')}
                onChange={(value) =>
                  updateTailorLength({
                    maxBulletsPerEntry: (value === 'all' ? null : Number(value)) as TailorBulletCap,
                  })
                }
                disabled={isLoading}
                className={OPTION_ROW}
              />
            </div>
          )}

          {/* ATS and writing scores: the last preview's, kept after the review closes. */}
          {!isGenerating && hasResults && (
            <div className="space-y-4 p-6">
              {atsResult && (
                <ATSScoreCard
                  atsScore={atsResult}
                  template={atsTemplate}
                  previousScore={atsPrevious}
                />
              )}
              {writingResult && <WritingScoreCard writing={writingResult} resume={writingResume} />}
            </div>
          )}
        </section>
      </div>

      {/* The action bar: always in view (pinned to the screen's foot on a phone). */}
      <div className="sticky bottom-0 shrink-0 space-y-3 border-t border-ink bg-canvas px-6 py-3">
        <FadePresence show={!!error}>
          <Alert tone="error">{error}</Alert>
        </FadePresence>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {blockedReason ? (
            <p className="mr-auto font-mono text-xs text-ink-soft">{blockedReason}</p>
          ) : (
            queueIgnoresLength && (
              <p className="mr-auto text-xs text-ink-soft">{t('tailor.queueIgnoresLength')}</p>
            )
          )}
          {!agentMode && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleAddToQueue()}
              disabled={generateDisabled}
            >
              {isQueueing ? (
                <>
                  <SpinnerGap aria-hidden="true" className="animate-spin" />
                  {t('queue.form.adding')}
                </>
              ) : (
                t('tailor.addToQueue')
              )}
            </Button>
          )}
          <Button
            type="button"
            onClick={agentMode ? () => setShowAgentPrompt(true) : handleGenerate}
            disabled={generateDisabled}
          >
            {isLoading ? (
              <>
                <SpinnerGap aria-hidden="true" className="animate-spin" />
                {t('common.processing')}
                {elapsed > 0 && <span className="text-xs tabular-nums">{elapsed}s</span>}
              </>
            ) : statusLoading ? (
              <>
                <SpinnerGap aria-hidden="true" className="animate-spin" />
                {t('common.checking')}
              </>
            ) : agentMode ? (
              t('agentPrompt.getPrompt')
            ) : !isLlmConfigured ? (
              t('tailor.configureApiKeyFirst')
            ) : (
              t('tailor.generateTailored')
            )}
          </Button>
        </div>
      </div>

      <AgentPromptDialog
        task={showAgentPrompt ? 'tailor' : null}
        resumeId={masterResumeId ?? ''}
        jobDescription={jobDescription}
        onClose={() => setShowAgentPrompt(false)}
      />

      {/* Diff preview modal */}
      {showDiffModal && pendingResult && (
        <DiffPreviewModal
          isOpen={showDiffModal}
          isConfirming={isConfirming}
          onClose={handleCloseDiffModal}
          onReject={handleRejectChanges}
          onConfirm={handleConfirmChanges}
          diffSummary={pendingResult?.data?.diff_summary}
          detailedChanges={pendingResult?.data?.detailed_changes}
          errorMessage={diffConfirmError ?? undefined}
          selectionSummary={pendingResult?.data?.bullet_selection}
          heavyMode={selectedPromptId === 'heavy'}
          actionsDisabled={keywordBusy}
          placements={pendingResult?.data?.keyword_placements}
          scoreChange={
            atsPrevious != null && atsResult
              ? { before: atsPrevious, after: atsResult.overall_score }
              : null
          }
          resume={pendingResult?.data?.resume_preview as ResumeData | undefined}
          keywordPanel={
            atsResult && pendingResult?.data?.preview_id ? (
              <KeywordForcingPanel
                unsupported={unplacedKeywords(atsResult.missing_keywords)}
                supported={unplacedKeywords(atsResult.injectable_keywords)}
                onApply={(keywords, addToMaster) => void handleApplyKeywords(keywords, addToMaster)}
                busy={keywordBusy}
                error={keywordError}
                remaining={Math.max(0, MAX_FORCED_KEYWORDS - forcedKeywords.length)}
              />
            ) : null
          }
        />
      )}

      <ConfirmDialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
        title={t('tailor.regenerateDialog.title')}
        description={t('tailor.regenerateDialog.description')}
        confirmLabel={t('tailor.regenerateDialog.confirmLabel')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        onConfirm={handleRegenerateConfirm}
      />

      <ConfirmDialog
        open={showMissingDiffDialog}
        onOpenChange={(open) => {
          if (!open && !missingDiffConfirmInFlight.current) {
            handleCloseMissingDiffDialog();
          }
        }}
        title={t('tailor.missingDiffDialog.title')}
        description={t('tailor.missingDiffDialog.description')}
        confirmLabel={t('tailor.missingDiffDialog.confirmLabel')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        closeOnConfirm={false}
        onConfirm={handleMissingDiffConfirm}
        onCancel={() => {
          if (!missingDiffConfirmInFlight.current) handleCloseMissingDiffDialog();
        }}
        confirmDisabled={isLoading || !missingDiffResult}
        cancelDisabled={isLoading}
        errorMessage={missingDiffError ?? undefined}
      />
    </PageFrame>
  );
}
