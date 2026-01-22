'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import type { ImprovedResult } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  uploadJobDescriptions,
  previewImproveResume,
  confirmImproveResume,
} from '@/lib/api/resume';
import { fetchPromptConfig, type PromptOption } from '@/lib/api/config';
import { Dropdown } from '@/components/ui/dropdown';
import { useStatusCache } from '@/lib/context/status-cache';
import { Loader2, ArrowLeft, AlertTriangle, Settings } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function TailorPage() {
  const { t } = useTranslations();
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState('keywords');
  const [promptLoading, setPromptLoading] = useState(false);
  const hasUserSelectedPrompt = useRef(false);
  const missingDiffConfirmInFlight = useRef(false);

  // Diff preview modal state
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [pendingResult, setPendingResult] = useState<ImprovedResult | null>(null);
  const [diffConfirmError, setDiffConfirmError] = useState<string | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showMissingDiffDialog, setShowMissingDiffDialog] = useState(false);
  const [missingDiffResult, setMissingDiffResult] = useState<ImprovedResult | null>(null);
  const [missingDiffError, setMissingDiffError] = useState<string | null>(null);

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
    const previewRecord = resumePreview as Record<string, unknown>;
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
      // The API expects an array of strings
      const jobId = await uploadJobDescriptions([description], resumeId);
      incrementJobs(); // Update cached counter

      // 2. Preview Resume
      const result = await previewImproveResume(resumeId, jobId, selectedPromptId);

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
      } else {
        setError(t('tailor.errors.failedToPreview'));
      }
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
    try {
      await runGenerate(resumeId, trimmedDescription);
    } finally {
      setIsLoading(false);
    }
  };

  // User confirms changes
  const handleConfirmChanges = async () => {
    if (!pendingResult) return;

    setIsLoading(true);
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
    try {
      await runGenerate(resumeId, trimmedDescription);
    } finally {
      setIsLoading(false);
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

          <div className="relative">
            <Textarea
              placeholder={t('tailor.jobDescriptionPlaceholder')}
              className="min-h-[300px] font-mono text-sm bg-gray-50 border-2 border-black focus:ring-0 focus:border-blue-700 resize-none p-4 rounded-none shadow-inner"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              disabled={isLoading}
            />
            <div className="absolute bottom-2 right-2 text-xs font-mono text-gray-400 pointer-events-none">
              {t('tailor.charactersCount', { count: jobDescription.length })}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-mono flex items-center gap-2">
              <span>!</span> {error}
            </div>
          )}

          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={isLoading || statusLoading || !jobDescription.trim() || !isLlmConfigured}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('common.processing')}
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
        </div>
      </div>

      {/* Diff preview modal */}
      {showDiffModal && pendingResult && (
        <DiffPreviewModal
          isOpen={showDiffModal}
          onClose={handleCloseDiffModal}
          onReject={handleRejectChanges}
          onConfirm={handleConfirmChanges}
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
