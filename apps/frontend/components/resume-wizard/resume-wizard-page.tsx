'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStatusCache } from '@/lib/context/status-cache';
import { useTranslations } from '@/lib/i18n';
import {
  clearResumeWizardDraft,
  readResumeWizardCompletion,
  writeResumeWizardCompletion,
  readResumeWizardDraft,
  writeResumeWizardDraft,
} from '@/lib/utils/resume-wizard-storage';
import {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
  type ResumeWizardSection,
  type ResumeWizardState,
} from '@/lib/api';
import { LivePreview } from './live-preview';
import { QuestionCard } from './question-card';

const MASTER_RESUME_KEY = 'master_resume_id';
/** First section still missing content (matches the backend gap heuristic); falls
 *  back to 'skills' (its additional.* merge is the broadest catch-all). */
function firstGapSection(data: ResumeWizardState['resume_data']): ResumeWizardSection {
  if (!data.workExperience?.length) return 'workExperience';
  if (!data.education?.length) return 'education';
  if (!data.personalProjects?.length) return 'personalProjects';
  return 'skills';
}

export function ResumeWizardPage() {
  const { t } = useTranslations();
  const router = useRouter();
  const { incrementResumes, setHasMasterResume } = useStatusCache();
  const [state, setState] = useState<ResumeWizardState>(() => createInitialResumeWizardState());
  const [answer, setAnswer] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [createdResumeId, setCreatedResumeId] = useState<string | null>(null);
  const [draftStorageUnavailable, setDraftStorageUnavailable] = useState(false);
  const [showLeaveWithoutDraftDialog, setShowLeaveWithoutDraftDialog] = useState(false);

  useEffect(() => {
    const completedId = readResumeWizardCompletion();
    if (completedId) {
      setCreatedResumeId(completedId);
      setState((current) => ({ ...current, step: 'complete' }));
    } else {
      const saved = readResumeWizardDraft();
      if (saved) setState(saved);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded || state.step === 'complete') return;
    setDraftStorageUnavailable(!writeResumeWizardDraft(state));
  }, [isLoaded, state]);

  useEffect(() => {
    if (!draftStorageUnavailable) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [draftStorageUnavailable]);

  const sectionLabel = t(`resumeWizard.sections.${state.current_question.section}`);

  const runTurn = async (
    action: 'answer' | 'skip' | 'back' | 'review',
    errorTranslationKey: string,
    withAnswer: boolean
  ) => {
    setErrorKey(null);
    setIsBusy(true);
    try {
      const response = await postResumeWizardTurn({
        state,
        action,
        ...(withAnswer ? { answer: { text: answer.trim() } } : {}),
      });
      setState(response.state);
      setAnswer('');
    } catch {
      setErrorKey(errorTranslationKey);
    } finally {
      setIsBusy(false);
    }
  };

  const handleContinue = () => {
    if (answer.trim().length === 0 || isBusy) return;
    void runTurn('answer', 'resumeWizard.errors.turnFailed', true);
  };
  const handleSkip = () => void runTurn('skip', 'resumeWizard.errors.turnFailed', false);
  const handleBack = () => void runTurn('back', 'resumeWizard.errors.turnFailed', false);
  const handleReview = () => void runTurn('review', 'resumeWizard.errors.turnFailed', false);
  const handleKeepAdding = () =>
    setState((current) => ({
      ...current,
      step: 'question',
      // Target the next content gap so the answer actually merges — the `review`
      // section is a no-op in the backend merge and would silently drop the answer.
      current_question: {
        text: t('resumeWizard.keepAddingPrompt'),
        section: firstGapSection(current.resume_data),
      },
    }));

  const handleRetryDraftBackup = () => {
    setDraftStorageUnavailable(!writeResumeWizardDraft(state));
  };

  const handleBackToDashboard = () => {
    if (draftStorageUnavailable) {
      setShowLeaveWithoutDraftDialog(true);
      return;
    }
    router.push('/dashboard');
  };

  const handleFinalize = async () => {
    if (createdResumeId || isBusy) return;
    setErrorKey(null);
    setIsBusy(true);
    let response;
    try {
      response = await finalizeResumeWizard(state);
      if (!response.resume_id) {
        throw new Error('Finalize returned no resume id');
      }
    } catch {
      setErrorKey('resumeWizard.errors.finalizeFailed');
      setIsBusy(false);
      return;
    }

    const resumeId = response.resume_id;
    setCreatedResumeId(resumeId);
    setDraftStorageUnavailable(false);
    setShowLeaveWithoutDraftDialog(false);
    setState((current) => ({ ...current, step: 'complete' }));
    try {
      localStorage.setItem(MASTER_RESUME_KEY, response.resume_id);
    } catch {
      // The server commit is authoritative; a blocked browser cache must not
      // turn an acknowledged creation back into a retryable create action.
    }
    if (!clearResumeWizardDraft()) writeResumeWizardCompletion(resumeId);
    try {
      incrementResumes();
      setHasMasterResume(true);
    } catch {
      // Status cache is derived UI state. The created resume remains committed.
    }
    try {
      router.push(`/builder?id=${resumeId}`);
    } catch {
      setErrorKey('resumeWizard.errors.createdNavigationFailed');
    }
    setIsBusy(false);
  };

  const handleOpenCreated = () => {
    if (!createdResumeId) return;
    try {
      router.push(`/builder?id=${createdResumeId}`);
    } catch {
      setErrorKey('resumeWizard.errors.createdNavigationFailed');
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-black md:px-8 md:py-10">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <h1 className="font-mono text-xs font-bold uppercase tracking-wider text-steel-grey">
              {t('resumeWizard.title')}
            </h1>
            <Button type="button" variant="ghost" onClick={handleBackToDashboard}>
              {t('resumeWizard.actions.backToDashboard')}
            </Button>
          </div>

          {draftStorageUnavailable && state.step !== 'complete' && (
            <div className="border-2 border-orange-500 bg-orange-50 p-4" role="alert">
              <p className="font-mono text-sm font-bold uppercase tracking-wider text-orange-700">
                {t('resumeWizard.draftStorageUnavailable.title')}
              </p>
              <p className="mt-1 font-sans text-sm">
                {t('resumeWizard.draftStorageUnavailable.description')}
              </p>
              <Button
                type="button"
                variant="warning"
                className="mt-3"
                onClick={handleRetryDraftBackup}
              >
                {t('resumeWizard.actions.retryDraftBackup')}
              </Button>
            </div>
          )}

          {errorKey && (
            <div className="border-2 border-red-600 bg-red-100 p-4" role="alert">
              <p className="font-mono text-sm font-bold uppercase tracking-wider text-red-600">
                {t('common.error')}
              </p>
              <p className="mt-1 font-sans text-sm">{t(errorKey)}</p>
            </div>
          )}

          {state.step === 'complete' && createdResumeId ? (
            <section className="border-2 border-green-700 bg-white p-5 shadow-sw-lg md:p-8">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-green-700">
                {t('resumeWizard.created.title')}
              </p>
              <p className="mt-3 font-sans text-sm">{t('resumeWizard.created.description')}</p>
              <Button type="button" className="mt-5" onClick={handleOpenCreated}>
                {t('resumeWizard.actions.openCreated')}
              </Button>
            </section>
          ) : (
            <QuestionCard
              step={state.step === 'complete' ? 'review' : state.step}
              question={state.current_question.text}
              sectionLabel={sectionLabel}
              progress={state.progress}
              answer={answer}
              onAnswerChange={setAnswer}
              canGoBack={state.history.length > 0}
              isBusy={isBusy}
              onContinue={handleContinue}
              onSkip={handleSkip}
              onBack={handleBack}
              onReview={handleReview}
              onFinalize={handleFinalize}
              onKeepAdding={handleKeepAdding}
              warnings={state.warnings}
              isComplete={state.is_complete}
              canFinalize={Boolean(state.resume_data.personalInfo?.name?.trim())}
            />
          )}
        </div>

        <LivePreview resumeData={state.resume_data} inferredSkills={state.inferred_skills} />
      </div>

      <ConfirmDialog
        open={showLeaveWithoutDraftDialog}
        onOpenChange={setShowLeaveWithoutDraftDialog}
        title={t('resumeWizard.leaveWithoutDraft.title')}
        description={t('resumeWizard.leaveWithoutDraft.description')}
        confirmLabel={t('resumeWizard.actions.leaveWithoutSaving')}
        cancelLabel={t('resumeWizard.actions.stay')}
        variant="warning"
        onConfirm={() => router.push('/dashboard')}
      />
    </main>
  );
}
