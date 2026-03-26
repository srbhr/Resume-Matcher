'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import type { ImprovedResult, ResumePreview } from '@/components/common/resume_previewer_context';
import type { ResumeFieldDiff } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  uploadJobDescriptions,
  previewImproveResumeStream,
  confirmImproveResume,
  fetchJobFromUrl,
} from '@/lib/api/resume';
import { fetchPromptConfig, type PromptOption } from '@/lib/api/config';
import { Dropdown } from '@/components/ui/dropdown';
import { useStatusCache } from '@/lib/context/status-cache';
import { Loader2, ArrowLeft, AlertTriangle, Settings, Link2, ClipboardList } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// --- Utility: parse a dot-bracket field_path into path segments ---
function parsePath(path: string): Array<string | number> {
  const segments: Array<string | number> = [];
  for (const part of path.split('.')) {
    const match = part.match(/^([^[]+)(?:\[(\d+)\])?$/);
    if (match) {
      segments.push(match[1]);
      if (match[2] !== undefined) segments.push(Number(match[2]));
    }
  }
  return segments;
}

// --- Utility: revert a single change in a deep-copied resume object ---
function revertChange(data: Record<string, unknown>, change: ResumeFieldDiff): void {
  const segments = parsePath(change.field_path);
  if (segments.length === 0) return;

  let current: unknown = data;
  for (let i = 0; i < segments.length - 1; i++) {
    if (current == null || typeof current !== 'object') return;
    current = (current as Record<string | number, unknown>)[segments[i]];
  }
  if (current == null || typeof current !== 'object') return;

  const key = segments[segments.length - 1];

  if (Array.isArray(current)) {
    const idx = key as number;
    if (change.change_type === 'modified') {
      current[idx] = change.original_value ?? '';
    } else if (change.change_type === 'added') {
      // Revert an AI-added array element: remove it
      const target = change.new_value;
      const foundIdx = target != null ? current.indexOf(target) : -1;
      if (foundIdx !== -1) {
        current.splice(foundIdx, 1);
      } else {
        current.splice(idx, 1);
      }
    } else if (change.change_type === 'removed') {
      // Revert a removed array element: re-insert at original index
      current.splice(idx, 0, change.original_value ?? '');
    }
  } else {
    const parent = current as Record<string | number, unknown>;
    if (change.change_type === 'modified' || change.change_type === 'removed') {
      parent[key] = change.original_value ?? '';
    } else if (change.change_type === 'added') {
      delete parent[key];
    }
  }
}

// --- Utility: apply rejections by reverting non-accepted changes ---
function applyRejections(
  resumePreview: ResumeData,
  detailedChanges: ResumeFieldDiff[],
  acceptedIndices: Set<number>
): ResumeData {
  const result = JSON.parse(JSON.stringify(resumePreview)) as Record<string, unknown>;

  const rejected = detailedChanges
    .map((change, idx) => ({ change, idx }))
    .filter(({ idx }) => !acceptedIndices.has(idx));

  // Process removals (added → revert = remove) descending to avoid index shifting
  const toRemove = rejected
    .filter((x) => x.change.change_type === 'added')
    .sort((a, b) => {
      const ai = (parsePath(a.change.field_path).at(-1) as number) ?? 0;
      const bi = (parsePath(b.change.field_path).at(-1) as number) ?? 0;
      return bi - ai;
    });

  // Process insertions (removed → revert = insert) ascending
  const toInsert = rejected
    .filter((x) => x.change.change_type === 'removed')
    .sort((a, b) => {
      const ai = (parsePath(a.change.field_path).at(-1) as number) ?? 0;
      const bi = (parsePath(b.change.field_path).at(-1) as number) ?? 0;
      return ai - bi;
    });

  const toModify = rejected.filter((x) => x.change.change_type === 'modified');

  for (const { change } of [...toModify, ...toRemove, ...toInsert]) {
    revertChange(result, change);
  }

  return result as unknown as ResumeData;
}

type LoadingStage = 'idle' | 'uploading' | 'tailoring';
type InputMode = 'text' | 'url';

export default function TailorPage() {
  const { t } = useTranslations();
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState('keywords');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('standard');
  const [promptLoading, setPromptLoading] = useState(false);
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

  // URL fetch mode state
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [jobUrl, setJobUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [urlFetchError, setUrlFetchError] = useState<string | null>(null);

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

  const startElapsedTimer = () => {
    setElapsedSeconds(0);
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
  };

  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setElapsedSeconds(0);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const storedId = localStorage.getItem('master_resume_id');
    if (!storedId) {
      router.push('/dashboard');
    } else {
      setMasterResumeId(storedId);
    }
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
    if (!masterResumeId) {
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
      resume_id: masterResumeId,
      job_id: result.data.job_id,
      improved_data: resumePreview as ResumeData,
      improvements:
        result.data.improvements?.map((item) => ({
          suggestion: item.suggestion,
          lineNumber: typeof item.lineNumber === 'number' ? item.lineNumber : null,
        })) ?? [],
    };
  };

  const confirmAndNavigate = async (result: ImprovedResult) => {
    const confirmed = await confirmImproveResume(buildConfirmPayload(result));
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

  const runGenerate = async (resumeId: string, description: string) => {
    try {
      // 1. Upload Job Description
      setLoadingStage('uploading');
      const jobId = await uploadJobDescriptions([description], resumeId);
      incrementJobs(); // Update cached counter

      // 2. Preview Resume — start elapsed timer for the slow LLM step
      setLoadingStage('tailoring');
      startElapsedTimer();
      const result = await previewImproveResumeStream(
        resumeId,
        jobId,
        selectedPromptId,
        selectedWorkflowId,
        (stage, message) => {
          // Use server message if present; fall back to i18n key for the stage
          const fallbacks: Record<string, string> = {
            keywords: t('tailor.streamStages.keywords'),
            improving: t('tailor.streamStages.improving'),
            refining: t('tailor.streamStages.refining'),
            diff: t('tailor.streamStages.diff'),
          };
          setLoadingMessage(message || fallbacks[stage] || '');
        }
      );
      stopElapsedTimer();

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
      stopElapsedTimer();
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
      } else {
        setError(t('tailor.errors.failedToPreview'));
      }
    }
  };

  const handleFetchUrl = async () => {
    const trimmedUrl = jobUrl.trim();
    if (!trimmedUrl) return;
    if (!trimmedUrl.startsWith('https://')) {
      setUrlFetchError(t('tailor.errors.invalidUrl'));
      return;
    }
    setIsFetchingUrl(true);
    setUrlFetchError(null);
    try {
      const result = await fetchJobFromUrl(trimmedUrl);
      setJobDescription(result.content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('timed out') || msg.includes('504')) {
        setUrlFetchError(t('tailor.errors.urlTimeout'));
      } else if (
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('fetch')
      ) {
        setUrlFetchError(t('tailor.errors.networkError'));
      } else if (msg) {
        // Show the server's detail message directly — it's user-friendly
        setUrlFetchError(msg);
      } else {
        setUrlFetchError(t('tailor.errors.failedToFetchUrl'));
      }
    } finally {
      setIsFetchingUrl(false);
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
    setIsLoading(true);
    setError(null);
    startTimer();
    try {
      await runGenerate(resumeId, trimmedDescription);
    } finally {
      setIsLoading(false);
      stopTimer();
    }
  };

  // User confirms changes
  const handleConfirmChanges = async () => {
    if (!pendingResult || isConfirming) return;

    setIsConfirming(true);
    setError(null);
    setDiffConfirmError(null);

    try {
      await confirmAndNavigate(pendingResult);
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

  // User confirms only selected changes (partial confirm)
  const handleConfirmPartial = async (acceptedIndices: Set<number>) => {
    if (!pendingResult || isLoading) return;
    const detailedChanges = pendingResult.data.detailed_changes ?? [];
    const modifiedPreview = applyRejections(
      pendingResult.data.resume_preview as ResumeData,
      detailedChanges,
      acceptedIndices
    );
    const modifiedResult: ImprovedResult = {
      ...pendingResult,
      data: { ...pendingResult.data, resume_preview: modifiedPreview as unknown as ResumePreview },
    };

    setIsLoading(true);
    setError(null);
    setDiffConfirmError(null);
    try {
      const payload = {
        ...buildConfirmPayload(modifiedResult),
        partial_confirm: true,
      };
      const confirmed = await confirmImproveResume(payload);
      incrementImprovements();
      incrementResumes();
      setImprovedData(confirmed);
      setShowDiffModal(false);
      setPendingResult(null);
      const newResumeId = confirmed?.data?.resume_id;
      router.push(newResumeId ? `/resumes/${newResumeId}` : '/builder');
    } catch (err) {
      console.error(err);
      const errorMessage = t('tailor.errors.failedToConfirm');
      setError(errorMessage);
      setDiffConfirmError(errorMessage);
    } finally {
      setIsLoading(false);
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
      await confirmAndNavigate(missingDiffResult);
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
      await runGenerate(resumeId, trimmedDescription);
    } finally {
      setIsLoading(false);
      stopTimer();
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-[#F6F5EE] flex flex-col items-center justify-center p-4 md:p-8 font-sans"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="w-full max-w-4xl bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] p-8 md:p-12 lg:p-14 relative">
        {/* Back Button */}
        <Button variant="link" className="absolute top-4 left-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </Button>

        <div className="mb-8 mt-4 text-center">
          <h1 className="font-serif text-4xl font-bold uppercase tracking-tight mb-2">
            {t('tailor.heroTitle')}
          </h1>
          <p className="font-mono text-sm text-blue-700 font-bold uppercase">
            {'// '}
            {t('tailor.pasteJobDescriptionBelow')}
          </p>
        </div>

        {/* LLM Not Configured Warning */}
        {!statusLoading && !isLlmConfigured && (
          <div className="mb-6 border-2 border-amber-500 bg-amber-50 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
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

          <Dropdown
            options={[
              {
                id: 'standard',
                label: t('tailor.workflowOptions.standard.label'),
                description: t('tailor.workflowOptions.standard.description'),
              },
              {
                id: 'granular',
                label: t('tailor.workflowOptions.granular.label'),
                description: t('tailor.workflowOptions.granular.description'),
              },
            ]}
            value={selectedWorkflowId}
            onChange={(value) => setSelectedWorkflowId(value)}
            label={t('tailor.workflowLabel')}
            description={t('tailor.workflowDescription')}
            disabled={isLoading}
          />

          {/* Input mode toggle */}
          <div className="flex border-2 border-black">
            <button
              type="button"
              onClick={() => setInputMode('text')}
              disabled={isLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                inputMode === 'text'
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-gray-100'
              }`}
            >
              <ClipboardList className="w-3 h-3" />
              {t('tailor.inputMode.paste')}
            </button>
            <button
              type="button"
              onClick={() => setInputMode('url')}
              disabled={isLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 font-mono text-xs font-bold uppercase tracking-wider border-l-2 border-black transition-colors ${
                inputMode === 'url'
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-gray-100'
              }`}
            >
              <Link2 className="w-3 h-3" />
              {t('tailor.inputMode.url')}
            </button>
          </div>

          {inputMode === 'url' ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder={t('tailor.urlInput.placeholder')}
                  className="flex-1 font-mono text-sm bg-[#F0F0E8] border-2 border-black focus:outline-none focus:border-blue-700 p-3"
                  value={jobUrl}
                  onChange={(e) => {
                    setJobUrl(e.target.value);
                    setUrlFetchError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleFetchUrl();
                    }
                  }}
                  disabled={isLoading || isFetchingUrl}
                />
                <Button
                  onClick={handleFetchUrl}
                  disabled={!jobUrl.trim() || isLoading || isFetchingUrl}
                  className="shrink-0"
                >
                  {isFetchingUrl ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('tailor.urlInput.fetching')}
                    </>
                  ) : (
                    t('tailor.urlInput.fetchButton')
                  )}
                </Button>
              </div>
              {urlFetchError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono flex items-center gap-2">
                  <span>!</span> {urlFetchError}
                </div>
              )}
              <p className="font-mono text-xs text-gray-500">{t('tailor.urlInput.hint')}</p>

              {jobDescription && (
                <div className="relative mt-2">
                  <Textarea
                    placeholder={t('tailor.jobDescriptionPlaceholder')}
                    className="min-h-[300px] font-mono text-sm bg-[#F0F0E8] border-2 border-black focus:ring-0 focus:border-blue-700 resize-none p-4 rounded-none"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                    disabled={isLoading}
                  />
                  <div className="absolute bottom-2 right-2 text-xs font-mono text-gray-400 pointer-events-none">
                    {t('tailor.charactersCount', { count: jobDescription.length })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              <Textarea
                placeholder={t('tailor.jobDescriptionPlaceholder')}
                className="min-h-[300px] font-mono text-sm bg-[#F0F0E8] border-2 border-black focus:ring-0 focus:border-blue-700 resize-none p-4 rounded-none"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                disabled={isLoading}
              />
              <div className="absolute bottom-2 right-2 text-xs font-mono text-gray-400 pointer-events-none">
                {t('tailor.charactersCount', { count: jobDescription.length })}
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-mono flex items-center gap-2">
              <span>!</span> {error}
            </div>
          )}

          {isLoading ? (
            <div className="border-2 border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
                {t('tailor.progress.title')}
              </p>

              {/* Stage 1: Upload */}
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-sm w-5 shrink-0 text-green-700">
                  {loadingStage === 'uploading' ? (
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                  ) : (
                    '✓'
                  )}
                </span>
                <span
                  className={`font-mono text-sm ${loadingStage !== 'uploading' ? 'text-gray-500' : 'font-bold'}`}
                >
                  {t('tailor.progress.uploading')}
                </span>
              </div>

              {/* Stage 2: AI tailoring */}
              <div className="flex items-start gap-3">
                <span className="font-mono text-sm w-5 shrink-0 mt-0.5 text-blue-700">
                  {loadingStage === 'tailoring' ? (
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                  ) : (
                    <span className="text-gray-300">·</span>
                  )}
                </span>
                <div className="flex-1">
                  <span
                    className={`font-mono text-sm ${loadingStage === 'tailoring' ? 'font-bold' : 'text-gray-400'}`}
                  >
                    {loadingStage === 'tailoring' && loadingMessage
                      ? loadingMessage
                      : t('tailor.progress.tailoring')}
                  </span>
                  {loadingStage === 'tailoring' && (
                    <span className="font-mono text-xs text-gray-500 ml-2">
                      {t('tailor.progress.elapsedSeconds', { seconds: elapsedSeconds })}
                    </span>
                  )}
                </div>
              </div>

              {/* Slow model note */}
              {loadingStage === 'tailoring' && elapsedSeconds >= 15 && (
                <p className="font-mono text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200">
                  {t('tailor.progress.slowModelNote')}
                </p>
              )}
            </div>
          ) : (
            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={statusLoading || !jobDescription.trim() || !isLlmConfigured}
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
                t('tailor.generateTailored')
              )}
            </Button>
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
          onConfirmPartial={handleConfirmPartial}
          isLoading={isLoading}
          diffSummary={pendingResult?.data?.diff_summary}
          detailedChanges={pendingResult?.data?.detailed_changes}
          errorMessage={diffConfirmError ?? undefined}
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
    </div>
  );
}
