'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import type { ImprovedResult, ResumePreview } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  uploadJobDescriptions,
  previewImproveResume,
  confirmImproveResume,
  fetchResumeList,
  fetchClarifyingQuestions,
  type GuidanceSet,
  type ClarifyQuestion,
  type ClarificationItem,
  type ClarificationSet,
} from '@/lib/api/resume';
import { fetchPromptConfig, type PromptOption } from '@/lib/api/config';
import { Dropdown } from '@/components/ui/dropdown';
import { useStatusCache } from '@/lib/context/status-cache';
import { Loader2, ArrowLeft, ArrowRight, AlertTriangle, Settings } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import { ClarifyStep } from '@/components/tailor/clarify-step';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ChatBot } from '@/components/chat-bot/chat-bot';

export default function TailorPageWrapper() {
  return (
    <Suspense fallback={null}>
      <TailorPage />
    </Suspense>
  );
}

function TailorPage() {
  const { t } = useTranslations();
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState('keywords');
  const [promptLoading, setPromptLoading] = useState(false);
  const [step, setStep] = useState<'job' | 'guidance' | 'clarify'>('job');

  // Guidance
  const [guidanceEnabled, setGuidanceEnabled] = useState(false);
  const [guidance, setGuidance] = useState({
    general: '',
    resume: '',
    cv: '',
    cover_letter: '',
    outreach: '',
  });

  // Clarifying Q&A
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({});
  const [isClarifying, setIsClarifying] = useState(false);

  // Stored job_id so we can pass it when clarify completes
  const pendingJobIdRef = useRef<string | null>(null);

  const hasUserSelectedPrompt = useRef(false);
  const missingDiffConfirmInFlight = useRef(false);

  // Diff preview modal state
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [pendingResult, setPendingResult] = useState<ImprovedResult | null>(null);
  const [diffConfirmError, setDiffConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showMissingDiffDialog, setShowMissingDiffDialog] = useState(false);
  const [missingDiffResult, setMissingDiffResult] = useState<ImprovedResult | null>(null);
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
  const searchParams = useSearchParams();
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

    const resolveMaster = async () => {
      // Prefer the master_id passed in the URL — that's the master the user
      // clicked "Tailor New Resume" from on the grouped dashboard.
      const fromUrl = searchParams?.get('master_id');
      if (fromUrl) {
        if (!cancelled) setMasterResumeId(fromUrl);
        return;
      }

      // Fall back to the most-recently updated master in the list so direct
      // visits to /tailor still work in multi-master mode.
      try {
        const resumes = await fetchResumeList(true);
        const masters = resumes.filter((r) => r.is_master);
        if (cancelled) return;
        if (masters.length === 0) {
          router.push('/dashboard');
          return;
        }
        setMasterResumeId(masters[0].resume_id);
      } catch (err) {
        console.error('Failed to resolve master resume for tailor:', err);
        if (!cancelled) router.push('/dashboard');
      }
    };

    resolveMaster();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

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

  const buildGuidancePayload = (): GuidanceSet | null => {
    // If guidance toggle is off, never send guidance regardless of stored text.
    if (!guidanceEnabled) return null;
    const trimmed = {
      general: guidance.general.trim() || null,
      resume: guidance.resume.trim() || null,
      cv: guidance.cv.trim() || null,
      cover_letter: guidance.cover_letter.trim() || null,
      outreach: guidance.outreach.trim() || null,
    };
    const hasAny = Object.values(trimmed).some((v) => v !== null);
    return hasAny ? trimmed : null;
  };

  const buildClarificationsPayload = (freeform?: string): ClarificationSet | null => {
    const items: ClarificationItem[] = clarifyQuestions
      .filter((q) => {
        const ans = (clarifyAnswers[q.question_id] ?? '').trim();
        return ans.length > 0;
      })
      .map((q) => ({
        question: q.question,
        answer: clarifyAnswers[q.question_id].trim(),
      }));
    const trimmedFreeform = (freeform ?? '').trim() || null;
    if (items.length === 0 && !trimmedFreeform) return null;
    return { items, freeform: trimmedFreeform };
  };

  const buildConfirmPayload = (
    result: ImprovedResult,
    overridePreview?: ResumePreview,
    clarifications?: ClarificationSet | null
  ) => {
    if (!masterResumeId) {
      throw new Error('Master resume ID is missing.');
    }
    const resumePreview = overridePreview ?? result.data.resume_preview;
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
      resume_id: masterResumeId,
      job_id: result.data.job_id,
      improved_data: resumePreview as ResumeData,
      improvements:
        result.data.improvements?.map((item) => ({
          suggestion: item.suggestion,
          lineNumber: typeof item.lineNumber === 'number' ? item.lineNumber : null,
        })) ?? [],
      guidance: buildGuidancePayload(),
      clarifications: clarifications ?? null,
    };
  };

  const confirmAndNavigate = async (
    result: ImprovedResult,
    overridePreview?: ResumePreview,
    clarifications?: ClarificationSet | null
  ) => {
    const confirmed = await confirmImproveResume(
      buildConfirmPayload(result, overridePreview, clarifications)
    );
    incrementImprovements();
    incrementResumes();
    setImprovedData(confirmed);

    const newResumeId = confirmed?.data?.resume_id;
    if (newResumeId) {
      router.push(`/resumes/${newResumeId}`);
    } else {
      router.push('/builder');
    }
  };

  const getGenerateValidationError = (trimmedDescription: string) => {
    if (!trimmedDescription) return null;
    if (trimmedDescription.length < 50) {
      return t('tailor.errors.jobDescriptionTooShort');
    }
    return null;
  };

  const runGenerate = async (
    resumeId: string,
    description: string,
    jobId?: string,
    clarifications?: ClarificationSet | null
  ) => {
    try {
      // 1. Upload Job Description (skip if we already have a jobId from clarify step)
      const effectiveJobId = jobId ?? (await uploadJobDescriptions([description], resumeId));
      if (!jobId) {
        incrementJobs();
      }
      // 2. Preview Resume
      const result = await previewImproveResume(
        resumeId,
        effectiveJobId,
        selectedPromptId,
        buildGuidancePayload(),
        clarifications ?? null
      );

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
      setShowDiffModal(true);
    } catch (err) {
      console.error(err);
      // Check for common error patterns
      const errorMessage = err instanceof Error ? err.message : '';
      if (
        errorMessage.toLowerCase().includes('api key') ||
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('authentication') ||
        errorMessage.includes('401')
      ) {
        setError(t('tailor.errors.apiKeyError'));
      } else if (
        errorMessage.toLowerCase().includes('rate limit') ||
        errorMessage.includes('429')
      ) {
        setError(t('tailor.errors.rateLimit'));
      } else if (
        errorMessage.toLowerCase().includes('timed out') ||
        errorMessage.toLowerCase().includes('timeout')
      ) {
        setError(t('tailor.errors.timeout'));
      } else {
        setError(t('tailor.errors.failedToPreview'));
      }
    }
  };

  // Called when user clicks "Generate" on the guidance step.
  // Uploads the JD, then fetches clarifying questions. If questions are found,
  // advances to the clarify step. Otherwise, goes straight to generation.
  const handleGenerate = async () => {
    const trimmedDescription = jobDescription.trim();
    if (!trimmedDescription || !masterResumeId) return;
    const validationError = getGenerateValidationError(trimmedDescription);
    if (validationError) {
      setError(validationError);
      return;
    }
    const resumeId = masterResumeId;
    setIsClarifying(true);
    setError(null);
    try {
      // Upload JD now so we have a job_id for the clarify call
      const jobId = await uploadJobDescriptions([trimmedDescription], resumeId);
      incrementJobs();
      pendingJobIdRef.current = jobId;

      const clarifyResult = await fetchClarifyingQuestions(
        resumeId,
        jobId,
        selectedPromptId,
        buildGuidancePayload()
      );

      if (clarifyResult.questions.length > 0) {
        // Reset previous answers
        setClarifyQuestions(clarifyResult.questions);
        setClarifyAnswers({});
        setStep('clarify');
      } else {
        // No questions — skip straight to generation
        setIsLoading(true);
        startTimer();
        try {
          await runGenerate(resumeId, trimmedDescription, jobId, null);
        } finally {
          setIsLoading(false);
          stopTimer();
        }
      }
    } catch (err) {
      console.error('Clarify step failed, proceeding to generate:', err);
      // Fallback: generate without clarifications if clarify endpoint fails
      setIsLoading(true);
      startTimer();
      try {
        await runGenerate(resumeId, trimmedDescription, pendingJobIdRef.current ?? undefined, null);
      } finally {
        setIsLoading(false);
        stopTimer();
      }
    } finally {
      setIsClarifying(false);
    }
  };

  // Called when the clarify step finishes (user answered questions + optional freeform)
  const handleClarifyFinish = async (freeform: string) => {
    const trimmedDescription = jobDescription.trim();
    const resumeId = masterResumeId;
    const jobId = pendingJobIdRef.current;
    if (!trimmedDescription || !resumeId) return;

    const clarifications = buildClarificationsPayload(freeform);
    setIsLoading(true);
    setError(null);
    startTimer();
    try {
      await runGenerate(resumeId, trimmedDescription, jobId ?? undefined, clarifications);
    } finally {
      setIsLoading(false);
      stopTimer();
    }
  };

  // User confirms changes
  const handleConfirmChanges = async (finalPreview?: ResumePreview) => {
    if (!pendingResult || isConfirming) return;

    setIsConfirming(true);
    setError(null);
    setDiffConfirmError(null);

    try {
      await confirmAndNavigate(pendingResult, finalPreview, buildClarificationsPayload());
      setShowDiffModal(false);
      setPendingResult(null);
    } catch (err) {
      console.error(err);
      const errorMessage = t('tailor.errors.failedToConfirm');
      setError(errorMessage);
      setDiffConfirmError(errorMessage);
    } finally {
      setIsConfirming(false);
    }
  };

  // User rejects changes
  const handleRejectChanges = () => {
    setShowDiffModal(false);
    setPendingResult(null);
    setDiffConfirmError(null);
    setShowRegenerateDialog(true);
  };

  const handleCloseDiffModal = () => {
    setShowDiffModal(false);
    setPendingResult(null);
    setDiffConfirmError(null);
  };

  const handleCloseMissingDiffDialog = () => {
    setShowMissingDiffDialog(false);
    setMissingDiffResult(null);
    setMissingDiffError(null);
    missingDiffConfirmInFlight.current = false;
  };

  const handleMissingDiffConfirm = async () => {
    if (!missingDiffResult || isLoading || missingDiffConfirmInFlight.current) return;
    missingDiffConfirmInFlight.current = true;
    setIsLoading(true);
    setError(null);
    setMissingDiffError(null);
    try {
      await confirmAndNavigate(missingDiffResult, undefined, buildClarificationsPayload());
      handleCloseMissingDiffDialog();
    } catch (err) {
      console.error(err);
      const errorMessage = t('tailor.errors.failedToConfirm');
      setError(errorMessage);
      setMissingDiffError(errorMessage);
    } finally {
      missingDiffConfirmInFlight.current = false;
      setIsLoading(false);
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
    setIsLoading(true);
    setError(null);
    startTimer();
    try {
      // Re-use existing job_id if we have one, re-upload otherwise
      await runGenerate(
        resumeId,
        trimmedDescription,
        pendingJobIdRef.current ?? undefined,
        buildClarificationsPayload()
      );
    } finally {
      setIsLoading(false);
      stopTimer();
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-4xl bg-card border border-border shadow-sw-lg p-8 md:p-12 lg:p-14 relative">
        {/* Back Button */}
        <Button variant="link" className="absolute top-4 left-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </Button>

        <div className="mb-6 mt-10 sm:mt-4 text-center">
          <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold uppercase tracking-tight mb-2">
            {t('tailor.heroTitle')}
          </h1>
          <p className="font-mono text-sm text-primary font-bold uppercase">
            {'// '}
            {t('tailor.pasteJobDescriptionBelow')}
          </p>
        </div>

        {/* LLM Not Configured Warning */}
        {!statusLoading && !isLlmConfigured && (
          <div className="mb-6 border-2 border-amber-500 bg-amber-50 p-4 shadow-sw-default">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-mono text-sm font-bold uppercase tracking-wider text-amber-800">
                  {t('tailor.setupRequiredTitle')}
                </p>
                <p className="font-mono text-xs text-amber-700 mt-1">
                  {t('tailor.noApiKeyMessage')}
                </p>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-2 mt-3 text-amber-700 hover:text-amber-900 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase underline">
                    {t('tailor.configureApiKey')}
                  </span>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {step === 'clarify' ? (
            /* ---- Clarify step ---- */
            <>
              <div className="border border-border bg-background p-4 font-mono text-xs space-y-1">
                <div>
                  <span className="font-bold uppercase tracking-wider">
                    {t('tailor.guidanceStep.strategyLabel')}:
                  </span>{' '}
                  {t(`tailor.promptOptions.${selectedPromptId}.label`)}
                </div>
              </div>
              <ClarifyStep
                questions={clarifyQuestions}
                answers={clarifyAnswers}
                onAnswer={(qid, ans) => setClarifyAnswers((prev) => ({ ...prev, [qid]: ans }))}
                onFinish={handleClarifyFinish}
                onBack={() => setStep('guidance')}
              />
              {isLoading && (
                <div className="flex items-center gap-2 font-mono text-xs text-steel-grey">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.processing')}
                  {elapsed > 0 && <span className="opacity-70 ml-1">{elapsed}s</span>}
                </div>
              )}
            </>
          ) : step === 'job' ? (
            /* ---- Job description step ---- */
            <>
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

              <div className="relative">
                <Textarea
                  placeholder={t('tailor.jobDescriptionPlaceholder')}
                  className="min-h-[300px] font-mono text-sm bg-background border-2 border-border focus:ring-0 focus:border-primary resize-none p-4 rounded-none"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  disabled={isLoading}
                />
                <div className="absolute bottom-2 right-2 text-xs font-mono text-steel-grey pointer-events-none">
                  {t('tailor.charactersCount', { count: jobDescription.length })}
                </div>
              </div>
            </>
          ) : (
            /* ---- Guidance step ---- */
            <>
              <div className="border border-border bg-background p-4 font-mono text-xs space-y-1">
                <div>
                  <span className="font-bold uppercase tracking-wider">
                    {t('tailor.guidanceStep.strategyLabel')}:
                  </span>{' '}
                  {t(`tailor.promptOptions.${selectedPromptId}.label`)}
                </div>
                <div className="truncate">
                  <span className="font-bold uppercase tracking-wider">
                    {t('tailor.guidanceStep.contextLabel')}:
                  </span>{' '}
                  {jobDescription.trim().slice(0, 120)}
                  {jobDescription.trim().length > 120 ? '…' : ''}
                </div>
              </div>

              <ToggleSwitch
                checked={guidanceEnabled}
                onCheckedChange={setGuidanceEnabled}
                label={t('tailor.guidanceStep.toggleLabel')}
                description={t('tailor.guidanceStep.toggleDescription')}
                disabled={isLoading}
              />

              {guidanceEnabled && (
                <div>
                  <p className="font-mono text-sm text-primary font-bold uppercase mb-1">
                    {t('tailor.guidanceStep.subhead')}
                  </p>
                  <h2 className="font-serif text-2xl font-bold uppercase tracking-tight mb-2">
                    {t('tailor.guidanceStep.heading')}
                  </h2>
                  <p className="font-mono text-xs text-steel-grey mb-4">
                    {t('tailor.guidanceStep.description')}
                  </p>

                  <div className="space-y-4">
                    {(['general', 'resume', 'cv', 'cover_letter', 'outreach'] as const).map(
                      (field) => (
                        <div key={field}>
                          <label className="block font-mono text-xs font-bold uppercase tracking-wider mb-1">
                            {t(`tailor.guidanceStep.fields.${field}.label`)}
                          </label>
                          <p className="font-mono text-xs text-steel-grey mb-2">
                            {t(`tailor.guidanceStep.fields.${field}.description`)}
                          </p>
                          <Textarea
                            placeholder={t(`tailor.guidanceStep.fields.${field}.placeholder`)}
                            className="min-h-[96px] font-mono text-sm bg-background border-2 border-border focus:ring-0 focus:border-primary resize-none p-3 rounded-none"
                            value={guidance[field]}
                            onChange={(e) =>
                              setGuidance((prev) => ({ ...prev, [field]: e.target.value }))
                            }
                            onKeyDown={handleTextareaKeyDown}
                            disabled={isLoading}
                          />
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-mono flex items-center gap-2">
              <span>!</span> {error}
            </div>
          )}

          {step !== 'clarify' && (
            <>
              {step === 'job' ? (
                <Button
                  size="lg"
                  onClick={() => {
                    const trimmed = jobDescription.trim();
                    if (!trimmed) return;
                    const validationError = getGenerateValidationError(trimmed);
                    if (validationError) {
                      setError(validationError);
                      return;
                    }
                    setError(null);
                    setStep('guidance');
                  }}
                  disabled={
                    isLoading || statusLoading || !jobDescription.trim() || !isLlmConfigured
                  }
                  className="w-full"
                >
                  {statusLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {t('common.checking')}
                    </>
                  ) : !isLlmConfigured ? (
                    t('tailor.configureApiKeyFirst')
                  ) : (
                    <>
                      {t('common.next')}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              ) : (
                <div className="flex gap-3">
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setStep('job');
                    }}
                    disabled={isLoading || isClarifying}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {t('common.back')}
                  </Button>
                  <Button
                    size="lg"
                    onClick={handleGenerate}
                    disabled={
                      isLoading ||
                      isClarifying ||
                      statusLoading ||
                      !jobDescription.trim() ||
                      !isLlmConfigured
                    }
                    className="flex-1"
                  >
                    {isLoading || isClarifying ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {isClarifying ? t('tailor.clarifyStep.analyzing') : t('common.processing')}
                        {elapsed > 0 && (
                          <span className="font-mono text-xs opacity-70 ml-2">{elapsed}s</span>
                        )}
                      </>
                    ) : (
                      t('tailor.generateTailored')
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
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
          improvedPreview={pendingResult?.data?.resume_preview}
          tailorSessionId={pendingResult?.data?.tailor_session_id ?? null}
          errorMessage={diffConfirmError ?? undefined}
          resumeId={masterResumeId}
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
          if (!open) {
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
        onCancel={handleCloseMissingDiffDialog}
        confirmDisabled={isLoading || !missingDiffResult}
        errorMessage={missingDiffError ?? undefined}
      />
      {masterResumeId && <ChatBot resumeId={masterResumeId} />}
    </div>
  );
}
