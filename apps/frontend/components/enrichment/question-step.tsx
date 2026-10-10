'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { EnrichmentQuestion, EnrichmentItem } from '@/lib/api/enrichment';
import { useTranslations } from '@/lib/i18n';

interface QuestionStepProps {
  question: EnrichmentQuestion;
  item: EnrichmentItem | undefined;
  answer: string;
  questionNumber: number;
  totalQuestions: number;
  onAnswer: (answer: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onFinish: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function QuestionStep({
  question,
  item,
  answer,
  questionNumber,
  totalQuestions,
  onAnswer,
  onNext,
  onPrev,
  onFinish,
  isFirst,
  isLast,
}: QuestionStepProps) {
  const { t } = useTranslations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const questionId = useId();
  const [localAnswer, setLocalAnswer] = useState(answer);

  // Sync local answer with prop
  useEffect(() => {
    setLocalAnswer(answer);
  }, [answer, question.question_id]);

  // Auto-focus textarea when question changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [question.question_id]);

  const handleChange = (value: string) => {
    setLocalAnswer(value);
    onAnswer(value);
  };

  const handleContinue = useCallback(() => {
    if (isLast) {
      onFinish();
    } else {
      onNext();
    }
  }, [isLast, onFinish, onNext]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter without shift = next/finish (only if textarea not focused or ctrl/cmd held)
      if (e.key === 'Enter' && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleContinue();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleContinue]);

  return (
    <div className="flex flex-col h-full min-h-[500px]">
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-steel tabular-nums">
            {t('enrichment.questionProgress', { current: questionNumber, total: totalQuestions })}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: totalQuestions }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-6 transition-colors ${
                i < questionNumber ? 'bg-ink' : i === questionNumber - 1 ? 'bg-ink' : 'bg-panel'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Item context badge */}
      {item && (
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-paper border border-paper text-sm font-mono">
            <span className="text-ink-soft">
              {item.item_type === 'experience'
                ? t('enrichment.itemType.experience')
                : t('enrichment.itemType.project')}
              :
            </span>
            <span className="font-semibold text-ink-soft">{item.title}</span>
            {item.subtitle && <span className="text-steel">@ {item.subtitle}</span>}
          </div>
        </div>
      )}

      {/* Question */}
      <div className="flex-1">
        <h2 id={questionId} className="font-serif text-xl font-bold mb-6 leading-tight">
          {question.question}
        </h2>

        <Textarea
          ref={textareaRef}
          value={localAnswer}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={question.placeholder}
          aria-labelledby={questionId}
          className="min-h-[180px] text-base resize-none"
        />

        <p className="text-xs text-steel mt-2 font-mono">{t('enrichment.shortcutHint')}</p>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-paper mt-6">
        <Button variant="outline" onClick={onPrev} disabled={isFirst}>
          <ChevronLeft aria-hidden="true" />
          {t('common.back')}
        </Button>

        <Button onClick={handleContinue}>
          {isLast ? t('common.finish') : t('common.continue')}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
