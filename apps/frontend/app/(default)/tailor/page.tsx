'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';
import { LlmSetupAlert } from '@/components/common/llm-setup-alert';
import { FadePresence } from '@/components/common/presence';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import type { ATSScore, ImprovedResult } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  uploadJobDescriptions,
  previewImproveResume,
  confirmImproveResume,
  fetchResumeList,
  toPageFitSettings,
  type ResumeListItem,
} from '@/lib/api/resume';
import { readStoredTemplateSettings } from '@/lib/utils/stored-template-settings';
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
import { fetchPromptConfig, type PromptOption } from '@/lib/api/config';
import { getPreviewErrorMessage } from '@/lib/utils/preview-error';
import { Dropdown } from '@/components/ui/dropdown';
import { useStatusCache } from '@/lib/context/status-cache';
import { Loader2 } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import { ATSScoreCard } from '@/components/tailor/ats-score-card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useOperationOwner } from '@/hooks/use-operation-owner';

export default function TailorPage() {
  const { t, locale } = useTranslations();
  const { begin, isCurrent, invalidate } = useOperationOwner('tailor');
  const confirmedResponses = useRef(new WeakMap<ImprovedResult, ImprovedResult>());
  const countedResumes = useRef(new Set<string>());
  const confirmationBusy = useRef(false);
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [masters, setMasters] = useState<ResumeListItem[]>([]);
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
    setTailorLength((current) => {
      const next = { ...current, ...patch };
      writeTailorLength(next);
      return next;
    });
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
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

    loadPromptConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };

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
    };
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
    if (!(failure instanceof Error) || !/preview expired|status (400|409)\b/i.test(failure.message))
      return false;
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

  const getGenerateValidationError = (trimmedDescription: string) => {
    if (!trimmedDescription) return null;
    if (trimmedDescription.length < 50) {
      return t('tailor.errors.jobDescriptionTooShort');
    }
    return null;
  };

  const runGenerate = async (resumeId: string, description: string, token: number) => {
    setAtsResult(null);
    try {
      // 1. Upload Job Description
      // The API expects an array of strings
      previewSourceIdRef.current = resumeId;
      const jobId = await uploadJobDescriptions([description], resumeId);
      if (!isCurrent(token)) return;
      incrementJobs(); // Update cached counter

      // 2. Preview Resume
      const result = await previewImproveResume(
        resumeId,
        jobId,
        selectedPromptId,
        buildPreviewLengthOptions(
          tailorLength,
          toPageFitSettings(readStoredTemplateSettings(), locale)
        )
      );
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
      setShowDiffModal(true);
    } catch (err) {
      if (!isCurrent(token)) return;
      console.error(err);
      setError(getPreviewErrorMessage(err, t));
    }
  };

  const handleGenerate = async () => {
    const trimmedDescription = jobDescription.trim();
    if (!trimmedDescription || !masterResumeId) return;
    const validationError = getGenerateValidationError(trimmedDescription);
    if (validationError) {
      setError(validationError);
      return;
    }
    const resumeId = masterResumeId;
    const token = begin();
    if (token === null) return;
    setIsLoading(true);
    setError(null);
    startTimer();
    try {
      await runGenerate(resumeId, trimmedDescription, token);
    } finally {
      if (isCurrent(token)) {
        setIsLoading(false);
        stopTimer();
      }
    }
  };

  // User confirms changes
  const handleConfirmChanges = async () => {
    if (!pendingResult || confirmationBusy.current) return;
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
    const trimmedDescription = jobDescription.trim();
    if (!trimmedDescription || !masterResumeId) return;
    const validationError = getGenerateValidationError(trimmedDescription);
    if (validationError) {
      setError(validationError);
      return;
    }
    const resumeId = masterResumeId;
    const token = begin();
    if (token === null) return;
    setIsLoading(true);
    setError(null);
    startTimer();
    try {
      await runGenerate(resumeId, trimmedDescription, token);
    } finally {
      if (isCurrent(token)) {
        setIsLoading(false);
        stopTimer();
      }
    }
  };

  return (
    <PageFrame>
      <PageHeader>
        <PageHeader.Back href="/dashboard">{t('common.back')}</PageHeader.Back>
        <PageHeader.Title>{t('tailor.heroTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('tailor.pasteJobDescriptionBelow')}</PageHeader.Subtitle>
      </PageHeader>

      <div className="p-8 md:p-12">
        <div className="max-w-4xl space-y-6">
          {/* LLM Not Configured Warning */}
          {!statusLoading && !isLlmConfigured && (
            <LlmSetupAlert
              titleKey="tailor.setupRequiredTitle"
              messageKey="tailor.noApiKeyMessage"
              actionKey="tailor.configureApiKey"
            />
          )}

          {masters.length > 1 && (
            <Dropdown
              label={t('tailor.selectResume')}
              description={t('tailor.selectResumeDescription')}
              options={masters.map((m) => ({
                id: m.resume_id,
                label: m.title || m.filename || m.resume_id,
              }))}
              value={masterResumeId ?? ''}
              onChange={setMasterResumeId}
              disabled={isLoading || promptLoading || showDiffModal}
            />
          )}

          <Dropdown
            options={
              promptOptions.length > 0
                ? promptOptions.map((opt) => ({
                    id: opt.id,
                    label: t(`tailor.promptOptions.${opt.id}.label`),
                    description: t(`tailor.promptOptions.${opt.id}.description`),
                  }))
                : [
                    {
                      id: 'nudge',
                      label: t('tailor.promptOptions.nudge.label'),
                      description: t('tailor.promptOptions.nudge.description'),
                    },
                    {
                      id: 'keywords',
                      label: t('tailor.promptOptions.keywords.label'),
                      description: t('tailor.promptOptions.keywords.description'),
                    },
                    {
                      id: 'full',
                      label: t('tailor.promptOptions.full.label'),
                      description: t('tailor.promptOptions.full.description'),
                    },
                  ]
            }
            value={selectedPromptId}
            onChange={(value) => {
              hasUserSelectedPrompt.current = true;
              setSelectedPromptId(value);
            }}
            label={t('tailor.promptLabel')}
            description={t('tailor.promptDescription')}
            disabled={isLoading || promptLoading}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Dropdown
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
              label={t('tailor.length.pageLimitLabel')}
              description={t('tailor.length.pageLimitDescription')}
              disabled={isLoading}
            />
            <Dropdown
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
              label={t('tailor.length.bulletsLabel')}
              description={t('tailor.length.bulletsDescription')}
              disabled={isLoading}
            />
          </div>

          <div className="relative">
            <Textarea
              aria-label={t('tailor.pasteJobDescription')}
              placeholder={t('tailor.jobDescriptionPlaceholder')}
              className="min-h-[300px] resize-none p-4"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              disabled={isLoading}
            />
            <div className="absolute bottom-2 right-2 font-mono text-xs tabular-nums text-steel pointer-events-none">
              {t('tailor.charactersCount', { count: jobDescription.length })}
            </div>
          </div>

          <FadePresence show={!!error}>
            <Alert tone="error">{error}</Alert>
          </FadePresence>

          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={
              isLoading ||
              statusLoading ||
              !jobDescription.trim() ||
              !isLlmConfigured ||
              !masterResumeId
            }
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('common.processing')}
                {elapsed > 0 && <span className="text-xs tabular-nums">{elapsed}s</span>}
              </>
            ) : statusLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('common.checking')}
              </>
            ) : !isLlmConfigured ? (
              t('tailor.configureApiKeyFirst')
            ) : (
              t('tailor.generateTailored')
            )}
          </Button>

          {/* ATS Score Breakdown: the last preview's score, kept after the diff modal closes */}
          {atsResult && <ATSScoreCard atsScore={atsResult} />}
        </div>
      </div>

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
