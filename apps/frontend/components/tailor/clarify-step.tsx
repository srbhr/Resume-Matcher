'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import type { ClarifyQuestion } from '@/lib/api/resume';
import { useTranslations } from '@/lib/i18n';

interface ClarifyStepProps {
  questions: ClarifyQuestion[];
  /** Map of question_id -> answer text (empty string = skipped) */
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
  onFinish: (freeform: string) => void;
  onBack: () => void;
}

/**
 * Pre-tailoring clarifying Q&A step.
 *
 * Renders one question at a time. "Skip" advances without storing an answer.
 * After the last question, shows an optional free-response textarea before
 * calling onFinish.
 */
export function ClarifyStep({ questions, answers, onAnswer, onFinish, onBack }: ClarifyStepProps) {
  const { t } = useTranslations();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [freeformMode, setFreeformMode] = useState(false);
  const [freeform, setFreeform] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const freeformRef = useRef<HTMLTextAreaElement>(null);

  const totalQuestions = questions.length;
  const isFreeformStep = freeformMode;
  const currentQuestion = !isFreeformStep ? questions[currentIdx] : null;
  const currentAnswer = currentQuestion ? (answers[currentQuestion.question_id] ?? '') : '';

  // Auto-focus the textarea when the question changes
  useEffect(() => {
    if (!isFreeformStep) {
      textareaRef.current?.focus();
    } else {
      freeformRef.current?.focus();
    }
  }, [currentIdx, isFreeformStep]);

  const handleNext = useCallback(() => {
    if (currentIdx < totalQuestions - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      setFreeformMode(true);
    }
  }, [currentIdx, totalQuestions]);

  const handleBack = useCallback(() => {
    if (isFreeformStep) {
      setFreeformMode(false);
    } else if (currentIdx > 0) {
      setCurrentIdx((i) => i - 1);
    } else {
      onBack();
    }
  }, [isFreeformStep, currentIdx, onBack]);

  const handleSkip = useCallback(() => {
    // Clear any stored answer so skipped questions aren't passed to backend
    if (currentQuestion) {
      onAnswer(currentQuestion.question_id, '');
    }
    handleNext();
  }, [currentQuestion, onAnswer, handleNext]);

  const handleFinish = useCallback(() => {
    onFinish(freeform.trim());
  }, [freeform, onFinish]);

  // Keyboard shortcut: Ctrl/Cmd+Enter to advance
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (isFreeformStep) {
          handleFinish();
        } else {
          handleNext();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFreeformStep, handleNext, handleFinish]);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };

  if (isFreeformStep) {
    return (
      <div className="flex flex-col min-h-[420px]">
        {/* Progress */}
        <div className="flex items-center justify-between mb-8">
          <span className="font-mono text-sm text-steel-grey">
            {t('tailor.clarifyStep.freeformProgress', {
              current: totalQuestions + 1,
              total: totalQuestions + 1,
            })}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: totalQuestions + 1 }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 transition-colors ${
                  i <= totalQuestions ? 'bg-black' : 'bg-paper-tint'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1">
          <h2 className="font-serif text-2xl font-bold uppercase tracking-tight mb-2">
            {t('tailor.clarifyStep.freeformHeading')}
          </h2>
          <p className="font-mono text-xs text-steel-grey mb-4">
            {t('tailor.clarifyStep.freeformDescription')}
          </p>
          <Textarea
            ref={freeformRef}
            value={freeform}
            onChange={(e) => setFreeform(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={t('tailor.clarifyStep.freeformPlaceholder')}
            className="min-h-[180px] font-mono text-sm bg-background border-2 border-border focus:ring-0 focus:border-primary resize-none p-3 rounded-none"
          />
          <p className="text-xs text-steel-grey mt-2 font-mono">
            {t('tailor.clarifyStep.shortcutHint')}
          </p>
        </div>

        <div className="flex items-center justify-between pt-6 border-t border-border mt-6">
          <Button variant="outline" onClick={handleBack} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            {t('common.back')}
          </Button>
          <Button onClick={handleFinish} className="gap-2">
            {t('tailor.clarifyStep.continueToGenerate')}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="flex flex-col min-h-[420px]">
      {/* Progress */}
      <div className="flex items-center justify-between mb-8">
        <span className="font-mono text-sm text-steel-grey">
          {t('tailor.clarifyStep.questionProgress', {
            current: currentIdx + 1,
            total: totalQuestions,
          })}
        </span>
        <div className="flex gap-1">
          {Array.from({ length: totalQuestions }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 transition-colors ${
                i <= currentIdx ? 'bg-black' : 'bg-paper-tint'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1">
        <p className="font-mono text-xs text-primary font-bold uppercase mb-2">
          {t('tailor.clarifyStep.subhead')}
        </p>
        <h2 className="font-serif text-xl font-bold leading-tight mb-6">
          {currentQuestion.question}
        </h2>

        <Textarea
          ref={textareaRef}
          value={currentAnswer}
          onChange={(e) => onAnswer(currentQuestion.question_id, e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder={currentQuestion.placeholder || t('tailor.clarifyStep.answerPlaceholder')}
          className="min-h-[140px] font-mono text-sm bg-background border-2 border-border focus:ring-0 focus:border-primary resize-none p-3 rounded-none"
        />
        <p className="text-xs text-steel-grey mt-2 font-mono">
          {t('tailor.clarifyStep.shortcutHint')}
        </p>
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-border mt-6">
        <Button variant="outline" onClick={handleBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          {t('common.back')}
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSkip} className="gap-2 text-steel-grey">
            <SkipForward className="w-4 h-4" />
            {t('tailor.clarifyStep.skip')}
          </Button>
          <Button onClick={handleNext} className="gap-2">
            {currentIdx < totalQuestions - 1 ? (
              <>
                {t('common.continue')}
                <ChevronRight className="w-4 h-4" />
              </>
            ) : (
              <>
                {t('common.next')}
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
