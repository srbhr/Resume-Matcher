'use client';

import React, { useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { DefaultBadge } from '@/components/common/default-badge';
import Resume, { ResumeData } from '@/components/dashboard/resume-component';
import {
  fetchResume,
  downloadResumePdf,
  getResumePdfUrl,
  deleteResume,
  retryProcessing,
  renameResume,
  setDefaultMasterResume,
  duplicateResume,
} from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';
import { Edit, Download, Loader2, Pencil, MessagesSquare, Copy } from 'lucide-react';
import { EnrichmentModal } from '@/components/enrichment/enrichment-modal';
import { useTranslations } from '@/lib/i18n';
import { withLocalizedDefaultSections } from '@/lib/utils/section-helpers';
import { useLanguage } from '@/lib/context/language-context';
import { downloadBlobAsFile, openUrlInNewTab, sanitizeFilename } from '@/lib/utils/download';
import { useOperationOwner } from '@/hooks/use-operation-owner';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export default function ResumeViewerPage() {
  const { t } = useTranslations();
  const translationsRef = useRef(t);
  useLayoutEffect(() => {
    translationsRef.current = t;
  }, [t]);
  const { uiLanguage } = useLanguage();
  const params = useParams();
  const router = useRouter();
  const { incrementResumes, decrementResumes, setHasMasterResume } = useStatusCache();
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [isMasterResume, setIsMasterResume] = useState(false);
  const [isDefaultMaster, setIsDefaultMaster] = useState(false);
  const [isSettingDefault, setIsSettingDefault] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [showSetDefaultSuccessDialog, setShowSetDefaultSuccessDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteSuccessDialog, setShowDeleteSuccessDialog] = useState(false);
  const [showDownloadSuccessDialog, setShowDownloadSuccessDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [setDefaultError, setSetDefaultError] = useState<string | null>(null);
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [resumeTitle, setResumeTitle] = useState<string | null>(null);
  const renameBusyRef = useRef(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [isTailoredResume, setIsTailoredResume] = useState(false);

  const resumeId = params?.id as string;
  const {
    begin: beginResumeLoad,
    isCurrent: isCurrentResumeLoad,
    invalidate: invalidateResumeLoad,
  } = useOperationOwner(resumeId);
  const { begin: beginRetry, isCurrent: isCurrentRetry } = useOperationOwner(resumeId);
  const { begin: beginRename, isCurrent: isCurrentRename } = useOperationOwner(resumeId);
  const { begin: beginDownload, isCurrent: isCurrentDownload } = useOperationOwner(resumeId);
  const { begin: beginDelete, isCurrent: isCurrentDelete } = useOperationOwner(resumeId);
  const { begin: beginSetDefault, isCurrent: isCurrentSetDefault } = useOperationOwner(resumeId);
  const { begin: beginDuplicate, isCurrent: isCurrentDuplicate } = useOperationOwner(resumeId);

  const localizedResumeData = useMemo(() => {
    if (!resumeData) return null;
    return withLocalizedDefaultSections(resumeData, t);
  }, [resumeData, t]);

  useEffect(() => {
    if (!resumeId) return;
    setShowEnrichmentModal(false);
    setIsRetrying(false);
    setIsDownloading(false);
    renameBusyRef.current = false;
    setIsEditingTitle(false);
    setEditingTitleValue('');
    setRenameError(null);
    setDownloadError(null);
    setDeleteError(null);
    setShowDeleteDialog(false);
    setShowDeleteSuccessDialog(false);
    setShowDownloadSuccessDialog(false);
    setShowSetDefaultSuccessDialog(false);
    setIsSettingDefault(false);
    setSetDefaultError(null);
    setIsDuplicating(false);
    setDuplicateError(null);
    setIsMasterResume(false);
    setIsDefaultMaster(false);
    const token = beginResumeLoad();
    if (token === null) return;

    const loadResume = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchResume(resumeId);
        if (!isCurrentResumeLoad(token)) return;

        // Get processing status
        const status = (data.raw_resume?.processing_status || 'pending') as ProcessingStatus;
        setProcessingStatus(status);

        // Capture title for editable display (always set to clear stale state)
        setResumeTitle(data.title ?? null);
        setIsTailoredResume(Boolean(data.parent_id));
        setIsMasterResume(Boolean(data.is_master));
        setIsDefaultMaster(Boolean(data.is_default_master));

        // Prioritize processed_resume if available (structured JSON)
        if (data.processed_resume) {
          setResumeData(data.processed_resume as ResumeData);
          setError(null);
        } else if (status === 'failed') {
          setError(translationsRef.current('resumeViewer.errors.processingFailed'));
        } else if (status === 'processing') {
          setError(translationsRef.current('resumeViewer.errors.stillProcessing'));
        } else if (data.raw_resume?.content) {
          // Try to parse raw_resume content as JSON (for tailored resumes stored as JSON)
          try {
            const parsed = JSON.parse(data.raw_resume.content);
            setResumeData(parsed as ResumeData);
          } catch {
            setError(translationsRef.current('resumeViewer.errors.notProcessedYet'));
          }
        } else {
          setError(translationsRef.current('resumeViewer.errors.noDataAvailable'));
        }
      } catch (err) {
        if (!isCurrentResumeLoad(token)) return;
        console.error('Failed to load resume:', err);
        setError(translationsRef.current('resumeViewer.errors.failedToLoad'));
      } finally {
        if (isCurrentResumeLoad(token)) setLoading(false);
      }
    };

    loadResume();
  }, [resumeId, beginResumeLoad, isCurrentResumeLoad]);

  const handleRetryProcessing = async () => {
    if (!resumeId) return;
    const token = beginRetry();
    if (token === null) return;
    setIsRetrying(true);
    try {
      const result = await retryProcessing(resumeId);
      if (!isCurrentRetry(token)) return;
      setProcessingStatus(result.processing_status);
      if (result.processing_status === 'ready') {
        // Reload the page to show the processed resume
        window.location.reload();
      } else {
        setError(
          t(
            result.processing_status === 'failed'
              ? 'resumeViewer.errors.processingFailed'
              : 'resumeViewer.errors.stillProcessing'
          )
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('status 404')) {
        if (localStorage.getItem('master_resume_id') === resumeId) {
          localStorage.removeItem('master_resume_id');
          setHasMasterResume(false);
        }
        if (!isCurrentRetry(token)) return;
        setProcessingStatus(null);
        setError(t('common.resumeDeleted'));
      } else {
        if (!isCurrentRetry(token)) return;
        console.error('Retry processing failed:', err);
        setError(t('resumeViewer.errors.processingFailed'));
      }
    } finally {
      if (isCurrentRetry(token)) setIsRetrying(false);
    }
  };

  const handleSetDefault = async () => {
    const token = beginSetDefault();
    if (token === null) return;
    setIsSettingDefault(true);
    setSetDefaultError(null);
    try {
      await setDefaultMasterResume(resumeId);
      try {
        localStorage.setItem('master_resume_id', resumeId);
      } catch {
        // The server commit is authoritative; a blocked browser cache must not
        // report a completed default change as failed.
      }
      if (!isCurrentSetDefault(token)) return;
      setIsDefaultMaster(true);
      setShowSetDefaultSuccessDialog(true);
    } catch (err) {
      if (!isCurrentSetDefault(token)) return;
      console.error('Failed to set default master resume:', err);
      setSetDefaultError(t('resumeViewer.setDefaultError'));
    } finally {
      if (isCurrentSetDefault(token)) setIsSettingDefault(false);
    }
  };

  const handleDuplicate = async () => {
    const token = beginDuplicate();
    if (token === null) return;
    setIsDuplicating(true);
    setDuplicateError(null);
    try {
      const copy = await duplicateResume(resumeId);
      // The copy exists on the server even if the user has navigated away, so the
      // cached counter is bumped regardless of the operation still being current.
      incrementResumes();
      if (!isCurrentDuplicate(token)) return;
      // Stay disabled through the navigation so a second click cannot make another copy.
      router.push(`/resumes/${copy.resume_id}`);
    } catch (err) {
      if (!isCurrentDuplicate(token)) return;
      console.error('Failed to duplicate resume:', err);
      // A 409 (master limit, not ready) carries a message written for the user.
      const isConflict = (err as { status?: number } | null)?.status === 409;
      setDuplicateError(
        isConflict && err instanceof Error ? err.message : t('resumeViewer.duplicateError')
      );
      setIsDuplicating(false);
    }
  };

  const handleEdit = () => {
    router.push(`/builder?id=${resumeId}`);
  };

  const handleInterviewPrep = () => {
    router.push(`/builder?id=${resumeId}&tab=interview-prep`);
  };

  const handleTitleSave = async () => {
    if (renameBusyRef.current) return;
    const trimmed = editingTitleValue.trim();
    if (!trimmed || trimmed === resumeTitle) {
      setIsEditingTitle(false);
      return;
    }
    const token = beginRename();
    if (token === null) return;
    renameBusyRef.current = true;
    setIsEditingTitle(false);
    try {
      setRenameError(null);
      await renameResume(resumeId, trimmed);
      if (!isCurrentRename(token)) return;
      setResumeTitle(trimmed);
      setIsEditingTitle(false);
    } catch (err) {
      if (!isCurrentRename(token)) return;
      console.error('Failed to rename resume:', err);
      setRenameError(t('resumeViewer.errors.failedToRename'));
    } finally {
      if (isCurrentRename(token)) renameBusyRef.current = false;
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  };

  // Reload resume data after enrichment
  const reloadResumeData = async (): Promise<boolean> => {
    const token = beginResumeLoad();
    if (token === null) return false;
    try {
      const data = await fetchResume(resumeId);
      if (!isCurrentResumeLoad(token)) return false;
      if (!data.processed_resume) throw new Error('Refreshed resume has no processed data');
      setResumeData(data.processed_resume as ResumeData);
      setError(null);
      return true;
    } catch (err) {
      if (!isCurrentResumeLoad(token)) return false;
      console.error('Failed to reload resume:', err);
      throw err;
    }
  };

  const handleEnrichmentComplete = async (): Promise<boolean> => {
    const refreshed = await reloadResumeData();
    if (refreshed) setShowEnrichmentModal(false);
    return refreshed;
  };

  const handleEnrichmentClose = () => {
    invalidateResumeLoad();
    setShowEnrichmentModal(false);
  };

  const handleDownload = async () => {
    const token = beginDownload();
    if (token === null) return;
    setIsDownloading(true);
    try {
      setDownloadError(null);
      const blob = await downloadResumePdf(resumeId, undefined, uiLanguage);
      const filename = sanitizeFilename(resumeTitle, resumeId, 'resume');
      downloadBlobAsFile(blob, filename);
      if (!isCurrentDownload(token)) return;
      setShowDownloadSuccessDialog(true);
    } catch (err) {
      if (!isCurrentDownload(token)) return;
      console.error('Failed to download resume:', err);
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        const fallbackUrl = getResumePdfUrl(resumeId, undefined, uiLanguage);
        const didOpen = openUrlInNewTab(fallbackUrl);
        if (!didOpen) {
          setDownloadError(t('common.popupBlocked', { url: fallbackUrl }));
        }
        return;
      }
      setDownloadError(t('resumeViewer.errors.failedToDownload'));
    } finally {
      if (isCurrentDownload(token)) setIsDownloading(false);
    }
  };

  const handleDeleteResume = async () => {
    const token = beginDelete();
    if (token === null) return;
    try {
      setDeleteError(null);
      await deleteResume(resumeId);
      // Update cached counters
      decrementResumes();
      if (localStorage.getItem('master_resume_id') === resumeId) {
        localStorage.removeItem('master_resume_id');
        setHasMasterResume(false);
      }
      if (!isCurrentDelete(token)) return;
      setShowDeleteDialog(false);
      setShowDeleteSuccessDialog(true);
    } catch (err) {
      if (!isCurrentDelete(token)) return;
      console.error('Failed to delete resume:', err);
      setDeleteError(t('resumeViewer.errors.failedToDelete'));
      setShowDeleteDialog(false);
    }
  };

  const handleDeleteSuccessConfirm = () => {
    setShowDeleteSuccessDialog(false);
    router.push('/dashboard');
  };

  const handleDownloadSuccessConfirm = () => {
    setShowDownloadSuccessDialog(false);
  };

  // Delete-related dialogs, shared by the failed-processing error branch and the
  // main viewer branch so the "Delete & Start Over" recovery action works in the
  // error state. Previously these lived only in the main branch, so on the error
  // path the confirm dialog never mounted and the delete request was never sent.
  // (The loading branch omits them — it has no delete affordance.)
  const deleteDialogs = (
    <>
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={
          isMasterResume ? t('confirmations.deleteMasterResumeTitle') : t('dashboard.deleteResume')
        }
        description={
          isMasterResume
            ? t('confirmations.deleteMasterResumeDescription')
            : t('confirmations.deleteResumeFromSystemDescription')
        }
        confirmLabel={t('confirmations.deleteResumeConfirmLabel')}
        cancelLabel={t('confirmations.keepResumeCancelLabel')}
        onConfirm={handleDeleteResume}
        variant="danger"
      />

      <ConfirmDialog
        open={showDeleteSuccessDialog}
        onOpenChange={setShowDeleteSuccessDialog}
        title={t('resumeViewer.deletedTitle')}
        description={
          isMasterResume
            ? t('resumeViewer.deletedDescriptionMaster')
            : t('resumeViewer.deletedDescriptionRegular')
        }
        confirmLabel={t('resumeViewer.returnToDashboard')}
        onConfirm={handleDeleteSuccessConfirm}
        variant="success"
        showCancelButton={false}
      />

      {deleteError && (
        <ConfirmDialog
          open={!!deleteError}
          onOpenChange={() => setDeleteError(null)}
          title={t('resumeViewer.deleteFailedTitle')}
          description={deleteError}
          confirmLabel={t('common.retry')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleDeleteResume}
          onCancel={() => setDeleteError(null)}
          variant="danger"
        />
      )}
    </>
  );

  if (loading) {
    return (
      <PageFrame>
        <div className="flex items-center gap-3 p-8 md:p-12">
          <Loader2 aria-hidden="true" className="size-6 animate-spin text-primary" />
          <StatusIndicator tone="active">{t('resumeViewer.loading')}</StatusIndicator>
        </div>
      </PageFrame>
    );
  }

  if (error || !resumeData) {
    const isProcessing = processingStatus === 'processing';
    const isFailed = processingStatus === 'failed';

    return (
      <>
        <PageFrame>
          <div className="flex max-w-2xl flex-col gap-6 p-8 md:p-12">
            <Alert tone={isProcessing ? 'info' : isFailed ? 'warning' : 'error'}>
              {error || t('resumeViewer.resumeNotFound')}
            </Alert>
            <div className="flex flex-wrap gap-3">
              {isFailed && (
                <>
                  <Button type="button" onClick={handleRetryProcessing} disabled={isRetrying}>
                    {isRetrying ? (
                      <>
                        <Loader2 aria-hidden="true" className="animate-spin" />
                        {t('common.processing')}
                      </>
                    ) : (
                      t('resumeViewer.retryProcessing')
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    {t('resumeViewer.deleteAndStartOver')}
                  </Button>
                </>
              )}
              <Button type="button" variant="outline" onClick={() => router.push('/dashboard')}>
                {t('resumeViewer.returnToDashboard')}
              </Button>
            </div>
          </div>
        </PageFrame>
        {deleteDialogs}
      </>
    );
  }

  return (
    <PageFrame>
      <PageHeader className="no-print">
        <PageHeader.Back href="/dashboard">{t('nav.backToDashboard')}</PageHeader.Back>

        {/* Editable title (the track name for a master) */}
        <div className="flex flex-wrap items-center gap-4">
          {isEditingTitle ? (
            <Input
              type="text"
              aria-label={t('resumeViewer.renameTitle')}
              value={editingTitleValue}
              onChange={(e) => setEditingTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              autoFocus
              maxLength={80}
              placeholder={t('resumeViewer.titlePlaceholder')}
              className="h-12 max-w-xl font-serif text-2xl font-bold"
            />
          ) : (
            <>
              <PageHeader.Title className={resumeTitle ? undefined : 'text-steel'}>
                {resumeTitle || t('resumeViewer.titlePlaceholder')}
              </PageHeader.Title>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('resumeViewer.renameTitle')}
                className="text-steel hover:text-ink"
                onClick={() => {
                  setEditingTitleValue(resumeTitle || '');
                  setIsEditingTitle(true);
                }}
              >
                <Pencil aria-hidden="true" />
              </Button>
            </>
          )}
          {isDefaultMaster && <DefaultBadge>{t('resumeViewer.defaultBadge')}</DefaultBadge>}
          {isMasterResume && !isDefaultMaster && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSetDefault}
              disabled={isSettingDefault}
            >
              {t('resumeViewer.setDefault')}
            </Button>
          )}
        </div>

        <PageHeader.Actions>
          {isMasterResume && (
            <Button type="button" onClick={() => setShowEnrichmentModal(true)}>
              {t('resumeViewer.enhanceResume')}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={handleEdit}>
            <Edit aria-hidden="true" />
            {t('dashboard.editResume')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDuplicate}
            disabled={isDuplicating}
          >
            <Copy aria-hidden="true" />
            {t('resumeViewer.duplicate')}
          </Button>
          {isTailoredResume && (
            <Button type="button" variant="outline" onClick={handleInterviewPrep}>
              <MessagesSquare aria-hidden="true" />
              {t('interviewPrep.title')}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={handleDownload} disabled={isDownloading}>
            <Download aria-hidden="true" />
            {isDownloading ? t('common.generating') : t('resumeViewer.downloadResume')}
          </Button>
        </PageHeader.Actions>
      </PageHeader>

      <div className="px-8 py-6 md:px-12 md:py-8">
        {/* Resume Viewer */}
        <div className="flex justify-center pb-4">
          <div className="resume-print w-full max-w-[250mm] shadow-sw-card border-2 border-ink bg-white">
            <Resume
              resumeData={localizedResumeData || resumeData}
              additionalSectionLabels={{
                technicalSkills: t('resume.additionalLabels.technicalSkills'),
                languages: t('resume.additionalLabels.languages'),
                certifications: t('resume.additionalLabels.certifications'),
                awards: t('resume.additionalLabels.awards'),
              }}
              sectionHeadings={{
                summary: t('resume.sections.summary'),
                experience: t('resume.sections.experience'),
                education: t('resume.sections.education'),
                projects: t('resume.sections.projects'),
                certifications: t('resume.sections.certifications'),
                skills: t('resume.sections.skillsOnly'),
                languages: t('resume.sections.languages'),
                awards: t('resume.sections.awards'),
                links: t('resume.sections.links'),
              }}
              fallbackLabels={{ name: t('resume.defaults.name') }}
            />
          </div>
        </div>

        <div className="flex pt-4 no-print">
          <Button type="button" variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            {isMasterResume
              ? t('confirmations.deleteMasterResumeTitle')
              : t('dashboard.deleteResume')}
          </Button>
        </div>
      </div>

      {deleteDialogs}

      <ConfirmDialog
        open={downloadError !== null}
        onOpenChange={(open) => !open && setDownloadError(null)}
        title={t('resumeViewer.downloadFailedTitle')}
        description={downloadError ?? ''}
        confirmLabel={t('common.retry')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleDownload}
        onCancel={() => setDownloadError(null)}
        variant="danger"
      />

      <ConfirmDialog
        open={renameError !== null}
        onOpenChange={(open) => !open && setRenameError(null)}
        title={t('resumeViewer.renameFailedTitle')}
        description={renameError ?? ''}
        confirmLabel={t('common.retry')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleTitleSave}
        onCancel={() => setRenameError(null)}
        variant="danger"
      />

      <ConfirmDialog
        open={setDefaultError !== null}
        onOpenChange={(open) => !open && setSetDefaultError(null)}
        title={t('common.error')}
        description={setDefaultError ?? ''}
        confirmLabel={t('common.retry')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleSetDefault}
        onCancel={() => setSetDefaultError(null)}
        variant="danger"
      />

      <ConfirmDialog
        open={duplicateError !== null}
        onOpenChange={(open) => !open && setDuplicateError(null)}
        title={t('common.error')}
        description={duplicateError ?? ''}
        confirmLabel={t('common.ok')}
        onConfirm={() => setDuplicateError(null)}
        variant="danger"
        showCancelButton={false}
      />

      <ConfirmDialog
        open={showSetDefaultSuccessDialog}
        onOpenChange={setShowSetDefaultSuccessDialog}
        title={t('common.success')}
        description={t('resumeViewer.setDefaultSuccess')}
        confirmLabel={t('common.ok')}
        onConfirm={() => setShowSetDefaultSuccessDialog(false)}
        variant="success"
        showCancelButton={false}
      />

      <ConfirmDialog
        open={showDownloadSuccessDialog}
        onOpenChange={setShowDownloadSuccessDialog}
        title={t('common.success')}
        description={t('builder.alerts.downloadSuccess')}
        confirmLabel={t('common.ok')}
        onConfirm={handleDownloadSuccessConfirm}
        variant="success"
        showCancelButton={false}
      />

      {/* Enrichment Modal - Only for master resume */}
      {isMasterResume && (
        <EnrichmentModal
          resumeId={resumeId}
          isOpen={showEnrichmentModal}
          onClose={handleEnrichmentClose}
          onComplete={handleEnrichmentComplete}
        />
      )}
    </PageFrame>
  );
}
