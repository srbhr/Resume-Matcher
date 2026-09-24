'use client';

import React, { useEffect, useState } from 'react';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from '@/lib/i18n';
import {
  createApplicationInterviewQuestion,
  deleteApplicationInterviewQuestion,
  listApplicationInterviewQuestions,
  type Application,
  type ApplicationInterviewQuestion,
} from '@/lib/api/tracker';

interface InterviewQuestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applications: Application[];
}

export function InterviewQuestionsDialog({
  open,
  onOpenChange,
  applications,
}: InterviewQuestionsDialogProps) {
  const { t } = useTranslations();
  const [questions, setQuestions] = useState<ApplicationInterviewQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState('');
  const [question, setQuestion] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    listApplicationInterviewQuestions()
      .then((data) => {
        if (!cancelled) setQuestions(data.questions);
      })
      .catch(() => {
        if (!cancelled) setError(t('tracker.questions.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedApplication = selectedApplicationId || applications[0]?.application_id || '';

  const handleAddQuestion = async () => {
    const trimmed = question.trim();
    if (!selectedApplication || !trimmed) return;

    setAdding(true);
    setAddError(null);
    try {
      const created = await createApplicationInterviewQuestion(selectedApplication, trimmed);
      setQuestions((current) => [created, ...current]);
      setQuestion('');
    } catch {
      setAddError(t('common.error'));
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteQuestion = async (question: ApplicationInterviewQuestion) => {
    setDeletingQuestionId(question.question_id);
    setAddError(null);
    try {
      await deleteApplicationInterviewQuestion(question.application_id, question.question_id);
      setQuestions((current) =>
        current.filter((item) => item.question_id !== question.question_id)
      );
    } catch {
      setAddError(t('common.error'));
    } finally {
      setDeletingQuestionId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-6">
        <DialogHeader>
          <DialogTitle>{t('tracker.questions.title')}</DialogTitle>
          <DialogDescription>{t('tracker.questions.description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto py-4">
          {applications.length > 0 && (
            <div className="mb-5 space-y-2 border-b border-black pb-5">
              <Label>{t('tracker.questions.application')}</Label>
              <Dropdown
                options={applications.map((application) => ({
                  id: application.application_id,
                  label: application.company || t('tracker.card.companyUnknown'),
                  description: application.role || t('tracker.card.roleUnknown'),
                }))}
                value={selectedApplication}
                onChange={setSelectedApplicationId}
              />
              <Label htmlFor="global-question">{t('tracker.modal.interviewQuestions')}</Label>
              <Textarea
                id="global-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.stopPropagation();
                }}
                placeholder={t('tracker.modal.questionPlaceholder')}
                rows={2}
              />
              <div className="flex items-center justify-end gap-3">
                {addError && <span className="font-mono text-xs text-destructive">{addError}</span>}
                <Button
                  size="sm"
                  onClick={handleAddQuestion}
                  disabled={adding || loading || !selectedApplication || !question.trim()}
                >
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      {t('tracker.modal.addQuestion')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-steel-grey" />
            </div>
          ) : error ? (
            <p className="py-8 text-center font-mono text-sm text-destructive">{error}</p>
          ) : questions.length === 0 ? (
            <p className="py-8 text-center font-mono text-sm text-steel-grey">
              {t('tracker.questions.empty')}
            </p>
          ) : (
            <ul className="divide-y divide-black border-y border-black">
              {questions.map((question) => (
                <li key={question.question_id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{question.question}</p>
                      <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink-soft">
                        {question.company || t('tracker.card.companyUnknown')}
                        {question.role ? ` / ${question.role}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleDeleteQuestion(question)}
                      disabled={deletingQuestionId === question.question_id}
                      aria-label={t('a11y.removeItem')}
                      title={t('a11y.removeItem')}
                    >
                      {deletingQuestionId === question.question_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('tracker.questions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
