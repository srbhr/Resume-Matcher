'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useStatusCache } from '@/lib/context/status-cache';
import { useTranslations } from '@/lib/i18n';
import {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
  type ResumeWizardSection,
  type ResumeWizardState,
} from '@/lib/api';
import { LivePreview } from './live-preview';
import { QuestionCard } from './question-card';

const DRAFT_STORAGE_KEY = 'resume_wizard_draft';
const MASTER_RESUME_KEY = 'master_resume_id';
const WIZARD_SECTIONS: ResumeWizardSection[] = [
  'intro',
  'contact',
  'summary',
  'workExperience',
  'internships',
  'education',
  'personalProjects',
  'skills',
  'review',
];
const WIZARD_STEPS: ResumeWizardState['step'][] = ['intro', 'question', 'review', 'complete'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Validate a saved draft against the current shape; fall back to a fresh state. */
function readSavedDraft(): ResumeWizardState | null {
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as unknown;
    if (!isRecord(parsed)) return null;

    const initial = createInitialResumeWizardState();
    const step = WIZARD_STEPS.includes(parsed.step as ResumeWizardState['step'])
      ? (parsed.step as ResumeWizardState['step'])
      : initial.step;
    const question = isRecord(parsed.current_question) ? parsed.current_question : {};
    const section = WIZARD_SECTIONS.includes(question.section as ResumeWizardSection)
      ? (question.section as ResumeWizardSection)
      : initial.current_question.section;

    return {
      ...initial,
      ...parsed,
      step,
      resume_data: isRecord(parsed.resume_data)
        ? (parsed.resume_data as ResumeWizardState['resume_data'])
        : initial.resume_data,
      current_question: {
        text:
          typeof question.text === 'string' && question.text.trim()
            ? question.text
            : initial.current_question.text,
        section,
      },
      history: Array.isArray(parsed.history) ? (parsed.history as ResumeWizardState['history']) : [],
      asked_count: typeof parsed.asked_count === 'number' ? parsed.asked_count : 0,
      inferred_skills: Array.isArray(parsed.inferred_skills)
        ? (parsed.inferred_skills as string[]).filter((s) => typeof s === 'string')
        : [],
      is_complete: parsed.is_complete === true,
      progress: isRecord(parsed.progress)
        ? (parsed.progress as ResumeWizardState['progress'])
        : initial.progress,
      warnings: Array.isArray(parsed.warnings)
        ? (parsed.warnings as string[]).filter((w) => typeof w === 'string')
        : [],
    };
  } catch {
    return null;
  }
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

  useEffect(() => {
    const saved = readSavedDraft();
    if (saved) setState(saved);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded || state.step === 'complete') return;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state));
  }, [isLoaded, state]);

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
      current_question: { text: t('resumeWizard.keepAddingPrompt'), section: 'review' },
    }));

  const handleFinalize = async () => {
    setErrorKey(null);
    setIsBusy(true);
    try {
      const response = await finalizeResumeWizard(state);
      localStorage.setItem(MASTER_RESUME_KEY, response.resume_id);
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      incrementResumes();
      setHasMasterResume(true);
      setState((current) => ({ ...current, step: 'complete' }));
      router.push(`/builder?id=${response.resume_id}`);
    } catch {
      setErrorKey('resumeWizard.errors.finalizeFailed');
    } finally {
      setIsBusy(false);
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
            <Button type="button" variant="ghost" onClick={() => router.push('/dashboard')}>
              {t('resumeWizard.actions.backToDashboard')}
            </Button>
          </div>

          {errorKey && (
            <div className="border-2 border-red-600 bg-red-100 p-4" role="alert">
              <p className="font-mono text-sm font-bold uppercase tracking-wider text-red-600">
                {t('common.error')}
              </p>
              <p className="mt-1 font-sans text-sm">{t(errorKey)}</p>
            </div>
          )}

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
          />
        </div>

        <LivePreview resumeData={state.resume_data} inferredSkills={state.inferred_skills} />
      </div>
    </main>
  );
}
