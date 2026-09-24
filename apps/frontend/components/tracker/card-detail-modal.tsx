'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Pencil from 'lucide-react/dist/esm/icons/pencil';
import Plus from 'lucide-react/dist/esm/icons/plus';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/lib/i18n';
import {
  createApplicationInterviewQuestion,
  getApplicationDetail,
  updateApplication,
  type ApplicationDetail,
} from '@/lib/api/tracker';

interface CardDetailModalProps {
  applicationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function CardDetailModal({
  applicationId,
  open,
  onOpenChange,
  onUpdated,
}: CardDetailModalProps) {
  const { t } = useTranslations();
  const router = useRouter();
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !applicationId) {
      setDetail(null);
      setQuestion('');
      setQuestionError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getApplicationDetail(applicationId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setNotes(data.notes ?? '');
        setNotesError(null);
        setQuestion('');
        setQuestionError(null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, applicationId]);

  // Keep textarea Enter from bubbling to dialog/global handlers.
  const handleNotesKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };

  const handleSaveNotes = async () => {
    if (!applicationId) return;
    setSavingNotes(true);
    setNotesError(null);
    try {
      await updateApplication(applicationId, { notes });
      onUpdated();
    } catch {
      // Show a generic message — never echo raw backend error text inline,
      // which could contain sensitive values.
      setNotesError(t('common.error'));
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!applicationId) return;
    const trimmed = question.trim();
    if (!trimmed) {
      setQuestionError(t('tracker.modal.questionRequired'));
      return;
    }

    setAddingQuestion(true);
    setQuestionError(null);
    try {
      const created = await createApplicationInterviewQuestion(applicationId, trimmed);
      setDetail((current) =>
        current
          ? {
              ...current,
              interview_questions: [created, ...(current.interview_questions ?? [])],
            }
          : current
      );
      setQuestion('');
    } catch {
      setQuestionError(t('common.error'));
    } finally {
      setAddingQuestion(false);
    }
  };

  const resumeAvailable = Boolean(detail?.resume);
  const interviewQuestions = detail?.interview_questions ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detail?.company || t('tracker.card.companyUnknown')}</DialogTitle>
          <DialogDescription>{detail?.role || t('tracker.card.roleUnknown')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-steel-grey" />
          </div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-mono text-xs uppercase text-ink-soft">
              <span className="border border-black bg-paper-tint px-2 py-0.5">
                {t(`tracker.columns.${detail.status}`)}
              </span>
              {detail.applied_at && (
                <span>
                  {new Date(detail.applied_at).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <Label>{t('tracker.modal.jobDescription')}</Label>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap border border-black bg-background p-3 text-sm">
                {detail.job_content || t('tracker.modal.noJobDescription')}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="card-notes">{t('tracker.modal.notes')}</Label>
              <Textarea
                id="card-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={handleNotesKeyDown}
                placeholder={t('tracker.modal.notesPlaceholder')}
                rows={3}
              />
              <div className="flex items-center justify-end gap-3">
                {notesError && (
                  <span className="font-mono text-xs text-destructive">{notesError}</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                >
                  {savingNotes ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('tracker.modal.saveNotes')
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="card-question">{t('tracker.modal.interviewQuestions')}</Label>
              {interviewQuestions.length > 0 ? (
                <ul className="divide-y divide-black border-y border-black">
                  {interviewQuestions.map((item) => (
                    <li key={item.question_id} className="py-2 text-sm text-ink">
                      {item.question}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-mono text-xs text-steel-grey">
                  {t('tracker.modal.noInterviewQuestions')}
                </p>
              )}
              <Textarea
                id="card-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleNotesKeyDown}
                placeholder={t('tracker.modal.questionPlaceholder')}
                rows={2}
              />
              <div className="flex items-center justify-end gap-3">
                {questionError && (
                  <span className="font-mono text-xs text-destructive">{questionError}</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddQuestion}
                  disabled={addingQuestion || !question.trim()}
                >
                  {addingQuestion ? (
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

            {!resumeAvailable && (
              <p className="font-mono text-xs text-warning">
                {t('tracker.modal.resumeUnavailable')}
              </p>
            )}
          </div>
        ) : (
          <p className="py-6 text-center font-mono text-sm text-steel-grey">
            {t('tracker.modal.loadFailed')}
          </p>
        )}

        <DialogFooter>
          <Button
            onClick={() => {
              if (detail?.resume_id) router.push(`/builder?id=${detail.resume_id}`);
            }}
            disabled={!resumeAvailable}
          >
            <Pencil className="h-4 w-4" />
            {t('tracker.modal.editResume')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
