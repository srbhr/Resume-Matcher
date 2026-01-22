'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, Briefcase, FolderKanban } from 'lucide-react';
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
  const [localAnswer, setLocalAnswer] = useState(answer);

  // Sync local answer with prop
  useEffect(() => {
    setLocalAnswer(answer);
  }, [answer, question.question_id]);

  // Auto-focus textarea when question changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [question.question_id]);

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
  }, [isLast, localAnswer]);

  const handleChange = (value: string) => {
    setLocalAnswer(value);
    onAnswer(value);
  };

  const handleContinue = () => {
    if (isLast) {
      onFinish();
    } else {
      onNext();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[500px]">
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-gray-500">
            {t('enrichment.questionProgress', { current: questionNumber, total: totalQuestions })}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: totalQuestions }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 transition-colors ${
                i < questionNumber
                  ? 'bg-black'
                  : i === questionNumber - 1
                    ? 'bg-black'
                    : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Item context badge */}
      {item && (
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 border border-gray-200 text-sm font-mono">
            {item.item_type === 'experience' ? (
              <Briefcase className="w-4 h-4 text-gray-600" />
            ) : (
              <FolderKanban className="w-4 h-4 text-gray-600" />
            )}
            <span className="text-gray-600">
              {item.item_type === 'experience'
                ? t('enrichment.itemType.experience')
                : t('enrichment.itemType.project')}
              :
            </span>
            <span className="font-semibold text-gray-900">{item.title}</span>
            {item.subtitle && <span className="text-gray-500">@ {item.subtitle}</span>}
          </div>
        </div>
      )}

      {/* Question */}
      <div className="flex-1">
        <h2 className="text-2xl font-bold mb-6 leading-tight">{question.question}</h2>

        <Textarea
          ref={textareaRef}
          value={localAnswer}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={question.placeholder}
          className="min-h-[180px] text-base resize-none font-mono"
        />

        <p className="text-xs text-gray-400 mt-2 font-mono">{t('enrichment.shortcutHint')}</p>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200 mt-6">
        <Button variant="outline" onClick={onPrev} disabled={isFirst} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          {t('common.back')}
        </Button>

        <Button onClick={handleContinue} className="gap-2">
          {isLast ? (
            <>
              {t('common.finish')}
              <ChevronRight className="w-4 h-4" />
            </>
          ) : (
            <>
              {t('common.continue')}
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
