'use client';

import React, { useEffect, useState } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dropdown } from '@/components/ui/dropdown';
import { Alert } from '@/components/ui/alert';
import { useTranslations } from '@/lib/i18n';
import { fetchResumeList, type ResumeListItem } from '@/lib/api/resume';
import { createApplication, type ApplicationStatus } from '@/lib/api/tracker';

interface ManualAddApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function ManualAddApplicationDialog({
  open,
  onOpenChange,
  onCreated,
}: ManualAddApplicationDialogProps) {
  const { t } = useTranslations();
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [resumeId, setResumeId] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState<ApplicationStatus>('applied');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Include the master resume — users may track an application against it.
    fetchResumeList(true)
      .then((items) => {
        setResumes(items);
        if (items.length > 0) setResumeId((prev) => prev || items[0].resume_id);
      })
      .catch(() => setResumes([]));
  }, [open]);

  const resumeLabel = (r: ResumeListItem): string =>
    r.title || r.filename || t('tracker.manualAdd.untitledResume');

  const handleNotesKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };

  const reset = () => {
    setJobDescription('');
    setCompany('');
    setRole('');
    setStatus('applied');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!resumeId || !jobDescription.trim()) {
      setError(t('tracker.manualAdd.validation'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createApplication({
        resume_id: resumeId,
        job_description: jobDescription.trim(),
        company: company.trim() || undefined,
        role: role.trim() || undefined,
        status,
      });
      reset();
      onCreated();
      onOpenChange(false);
    } catch {
      setError(t('tracker.manualAdd.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('tracker.manualAdd.title')}</DialogTitle>
          <DialogDescription>{t('tracker.manualAdd.description')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Dropdown
            label={t('tracker.manualAdd.resume')}
            options={resumes.map((r) => ({ id: r.resume_id, label: resumeLabel(r) }))}
            value={resumeId}
            onChange={setResumeId}
          />

          <div className="space-y-1">
            <Label htmlFor="manual-jd">{t('tracker.manualAdd.jobDescription')}</Label>
            <Textarea
              id="manual-jd"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              onKeyDown={handleNotesKeyDown}
              placeholder={t('tracker.manualAdd.jobDescriptionPlaceholder')}
              rows={5}
              aria-invalid={Boolean(error) && !jobDescription.trim()}
              aria-describedby={error ? 'manual-add-error' : undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="manual-company">{t('tracker.manualAdd.company')}</Label>
              <Input
                id="manual-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t('tracker.manualAdd.optional')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-role">{t('tracker.manualAdd.role')}</Label>
              <Input
                id="manual-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={t('tracker.manualAdd.optional')}
              />
            </div>
          </div>

          <Dropdown
            label={t('tracker.manualAdd.status')}
            options={[
              { id: 'applied', label: t('tracker.columns.applied') },
              { id: 'saved', label: t('tracker.columns.saved') },
            ]}
            value={status}
            onChange={(value) => setStatus(value as ApplicationStatus)}
          />

          {error && (
            <Alert id="manual-add-error" tone="error">
              {error}
            </Alert>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <SpinnerGap aria-hidden="true" className="animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              t('tracker.manualAdd.submit')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
