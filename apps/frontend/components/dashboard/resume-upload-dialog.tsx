'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  UploadIcon,
  Loader2Icon,
  AlertCircleIcon,
  FileIcon,
  XIcon,
  CheckCircle2Icon,
} from 'lucide-react';
import { useFileUpload, formatBytes } from '@/hooks/use-file-upload';
import { getUploadUrl } from '@/lib/api/client';
import { useTranslations } from '@/lib/i18n';
import { deleteResume, retryProcessing } from '@/lib/api/resume';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface ResumeUploadDialogProps {
  trigger?: React.ReactNode;
  onUploadComplete?: (resumeId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
];
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

export function ResumeUploadDialog({
  trigger,
  onUploadComplete,
  open: controlledOpen,
  onOpenChange,
}: ResumeUploadDialogProps) {
  const { t } = useTranslations();
  const [internalOpen, setInternalOpen] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error' | 'pending';
    message: string;
  } | null>(null);
  const [failedResumeId, setFailedResumeId] = useState<string | null>(null);
  const [failedIsMaster, setFailedIsMaster] = useState(false);
  const [isRetryingProcessing, setIsRetryingProcessing] = useState(false);
  const [isDeletingResume, setIsDeletingResume] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const recoveryOwnerRef = useRef(0);
  const recoveryBusyRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const UPLOAD_URL = getUploadUrl();

  const clearScheduledClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useLayoutEffect(
    () => () => {
      recoveryOwnerRef.current += 1;
      recoveryBusyRef.current = false;
      clearScheduledClose();
    },
    [clearScheduledClose]
  );

  const handleUploadSuccess = ({
    resumeId,
    fileId,
    message,
  }: {
    resumeId: string;
    fileId?: string;
    message: string;
  }) => {
    setUploadFeedback({ type: 'success', message });
    setFailedResumeId(null);

    // Close dialog after a short delay to show success state
    clearScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setIsOpen(false);
      setUploadFeedback(null);
      setFailedResumeId(null);
      if (fileId) {
        removeFile(fileId); // Clear file for next time
      }
    }, 1500);
    onUploadComplete?.(resumeId);
  };

  const [
    { files, isDragging, errors, isUploadingGlobal },
    {
      getInputProps,
      openFileDialog,
      removeFile,
      clearFiles,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
    },
  ] = useFileUpload({
    maxSize: MAX_FILE_SIZE,
    accept: ACCEPTED_FILE_TYPES.join(','),
    multiple: false,
    uploadUrl: UPLOAD_URL,
    onUploadSuccess: (uploadedFile, response) => {
      const data = response as {
        resume_id?: string;
        processing_status?: 'pending' | 'processing' | 'ready' | 'failed';
        is_master?: boolean;
      };
      if (data.resume_id) {
        const processingFailed = data.processing_status === 'failed';
        const successMessage = data.is_master
          ? t('dashboard.uploadDialog.successMaster')
          : t('dashboard.uploadDialog.success');
        if (processingFailed) {
          // Keep dialog open on failure so users can retry processing.
          setUploadFeedback({
            type: 'error',
            message: t('dashboard.uploadDialog.parsingFailedKeepOpen'),
          });
          setFailedResumeId(data.resume_id);
          setFailedIsMaster(data.is_master === true);
          return;
        }
        handleUploadSuccess({
          resumeId: data.resume_id,
          fileId: uploadedFile.id,
          message: successMessage,
        });
      } else {
        setFailedResumeId(null);
        setUploadFeedback({
          type: 'error',
          message: t('dashboard.uploadDialog.successMissingId'),
        });
      }
    },
    onUploadError: (_file, errorMsg, metadata) => {
      setFailedResumeId(metadata?.resume_id ?? null);
      setFailedIsMaster(metadata?.is_master ?? false);
      setUploadFeedback({
        type: 'error',
        message: errorMsg || t('dashboard.uploadDialog.failed'),
      });
    },
    onFilesChange: (currentFiles) => {
      recoveryOwnerRef.current += 1;
      recoveryBusyRef.current = false;
      setIsRetryingProcessing(false);
      setIsDeletingResume(false);
      setShowDeleteDialog(false);
      clearScheduledClose();
      if (currentFiles.length === 0) {
        setUploadFeedback(null);
        setFailedResumeId(null);
      }
    },
  });

  const clearFilesRef = useRef(clearFiles);
  const wasOpenRef = useRef(isOpen);

  useEffect(() => {
    clearFilesRef.current = clearFiles;
  }, [clearFiles]);

  useLayoutEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      recoveryOwnerRef.current += 1;
      recoveryBusyRef.current = false;
      setIsRetryingProcessing(false);
      setIsDeletingResume(false);
      setShowDeleteDialog(false);
      clearScheduledClose();
      clearFilesRef.current();
      setUploadFeedback(null);
      setFailedResumeId(null);
    }
    wasOpenRef.current = isOpen;
  }, [clearScheduledClose, isOpen]);

  const currentFile = files[0];
  const isRecovering = isRetryingProcessing || isDeletingResume;
  const displayErrors = uploadFeedback?.type === 'error' ? [uploadFeedback.message] : errors;
  const preventDropzoneInteraction = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleRetryProcessing = async () => {
    if (!failedResumeId || recoveryBusyRef.current) return;
    const owner = ++recoveryOwnerRef.current;
    recoveryBusyRef.current = true;
    const resumeIdToRetry = failedResumeId;
    const fileIdToRemove = currentFile?.id;
    setIsRetryingProcessing(true);
    try {
      const result = await retryProcessing(resumeIdToRetry);
      if (owner !== recoveryOwnerRef.current) return;
      if (result.processing_status !== 'ready') {
        setUploadFeedback(
          result.processing_status === 'failed'
            ? { type: 'error', message: t('dashboard.retryFailed') }
            : { type: 'pending', message: t(`dashboard.status.${result.processing_status}`) }
        );
        return;
      }

      handleUploadSuccess({
        resumeId: resumeIdToRetry,
        fileId: fileIdToRemove,
        message: t('dashboard.retrySuccess'),
      });
    } catch (err) {
      if (owner !== recoveryOwnerRef.current) return;
      console.error('Retry processing failed:', err);
      if (err instanceof Error && err.message.includes('status 404')) {
        clearFiles();
        setFailedResumeId(null);
        setUploadFeedback({ type: 'error', message: t('common.resumeDeleted') });
        return;
      }
      setUploadFeedback({ type: 'error', message: t('dashboard.retryFailed') });
    } finally {
      if (owner === recoveryOwnerRef.current) {
        recoveryBusyRef.current = false;
        setIsRetryingProcessing(false);
      }
    }
  };

  const handleDeleteSavedUpload = async () => {
    if (!failedResumeId || recoveryBusyRef.current) return;
    const owner = ++recoveryOwnerRef.current;
    recoveryBusyRef.current = true;
    const resumeIdToDelete = failedResumeId;
    setIsDeletingResume(true);
    try {
      await deleteResume(resumeIdToDelete);
      if (owner !== recoveryOwnerRef.current) return;
      clearFiles();
      setUploadFeedback({ type: 'error', message: t('common.resumeDeleted') });
    } catch (err) {
      if (owner !== recoveryOwnerRef.current) return;
      console.error('Failed to delete saved upload:', err);
      if (err instanceof Error && err.message.includes('status 404')) {
        clearFiles();
        setUploadFeedback({ type: 'error', message: t('common.resumeDeleted') });
        return;
      }
      setUploadFeedback({ type: 'error', message: t('dashboard.errors.deleteFailed') });
    } finally {
      if (owner === recoveryOwnerRef.current) {
        recoveryBusyRef.current = false;
        setIsDeletingResume(false);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-none border border-black shadow-sw-default hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all">
            <UploadIcon className="w-4 h-4 mr-2" />
            {t('dashboard.uploadResume')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-background border border-black shadow-sw-lg p-0 gap-0 rounded-none">
        <DialogHeader className="p-6 border-b border-black bg-white">
          <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight">
            {t('dashboard.uploadResume')}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 bg-background">
          <div
            className={`
                            relative border-2 border-dashed p-8 text-center transition-all duration-200
                            ${isDragging ? 'border-blue-700 bg-blue-50' : 'border-steel-grey hover:border-black hover:bg-white'}
                            ${currentFile ? 'bg-white border-solid border-black' : ''}
                            ${!currentFile && !isRecovering ? 'cursor-pointer' : 'cursor-default'}
                            ${isRecovering ? 'opacity-70' : ''}
                        `}
            onClick={!currentFile && !isRecovering ? openFileDialog : undefined}
            onDragEnter={isRecovering ? preventDropzoneInteraction : handleDragEnter}
            onDragLeave={isRecovering ? preventDropzoneInteraction : handleDragLeave}
            onDragOver={isRecovering ? preventDropzoneInteraction : handleDragOver}
            onDrop={isRecovering ? preventDropzoneInteraction : handleDrop}
          >
            <input {...getInputProps()} />

            {isUploadingGlobal ? (
              <div className="flex flex-col items-center py-4">
                <Loader2Icon className="w-10 h-10 animate-spin text-blue-700 mb-4" />
                <p className="font-mono text-sm font-bold uppercase text-blue-700">
                  {t('common.uploading')}
                </p>
              </div>
            ) : currentFile ? (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-left overflow-hidden">
                  <div className="w-10 h-10 border border-black bg-paper-tint flex items-center justify-center shrink-0">
                    <FileIcon className="w-5 h-5 text-black" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate max-w-[200px]">
                      {currentFile.file.name}
                    </p>
                    <p className="font-mono text-xs text-steel-grey">
                      {formatBytes(currentFile.file.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isRecovering}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(currentFile.id);
                  }}
                  className="hover:bg-red-100 text-red-600 rounded-none"
                  aria-label={t('a11y.removeFile')}
                  title={t('a11y.removeFile')}
                >
                  <XIcon className="w-5 h-5" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4">
                <div className="w-12 h-12 border border-black bg-white shadow-sw-default flex items-center justify-center mb-4">
                  <UploadIcon className="w-6 h-6 text-black" />
                </div>
                <p className="font-bold text-lg mb-1">
                  {t('dashboard.uploadDialog.dropzoneTitle')}
                </p>
                <p className="font-mono text-xs text-steel-grey uppercase">
                  {t('dashboard.uploadDialog.dropzoneSubtitle')}
                </p>
              </div>
            )}
          </div>

          {/* Feedback Messages */}
          {displayErrors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-red-700 text-sm">
              <AlertCircleIcon className="w-5 h-5 shrink-0" />
              <div>
                {displayErrors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            </div>
          )}

          {uploadFeedback?.type === 'pending' && (
            <p role="status" className="mt-4 border border-black p-3 font-mono text-sm">
              {uploadFeedback.message}
            </p>
          )}

          {uploadFeedback?.type === 'success' && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 flex items-center gap-2 text-green-700 text-sm font-bold">
              <CheckCircle2Icon className="w-5 h-5 shrink-0" />
              <p>{uploadFeedback.message}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-black bg-white flex flex-wrap justify-end gap-2">
          {failedResumeId && uploadFeedback?.type !== 'success' && (
            <Button
              variant="outline"
              className="rounded-none border-black hover:bg-paper-tint"
              onClick={handleRetryProcessing}
              disabled={isRecovering}
            >
              {isRetryingProcessing
                ? t('dashboard.retryingProcessing')
                : t('dashboard.retryProcessing')}
            </Button>
          )}
          {failedResumeId && uploadFeedback?.type !== 'success' && (
            <Button
              variant="destructive"
              disabled={isRecovering}
              onClick={() => setShowDeleteDialog(true)}
            >
              {t('dashboard.deleteResume')}
            </Button>
          )}
          {uploadFeedback?.type === 'error' && files.length > 0 && (
            <Button
              variant="outline"
              className="rounded-none border-black hover:bg-paper-tint"
              disabled={isRecovering}
              onClick={() => {
                if (files[0]) removeFile(files[0].id);
                setUploadFeedback(null);
                setFailedResumeId(null);
              }}
            >
              {t('dashboard.uploadDialog.tryDifferentFile')}
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="outline" className="rounded-none border-black hover:bg-paper-tint">
              {t('common.cancel')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
      <ConfirmDialog
        open={isOpen && showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t(
          failedIsMaster ? 'confirmations.deleteMasterResumeTitle' : 'confirmations.deleteResume'
        )}
        description={t(
          failedIsMaster
            ? 'confirmations.deleteMasterResumeDescription'
            : 'confirmations.deleteResumeDescription'
        )}
        confirmLabel={t('confirmations.deleteResumeConfirmLabel')}
        confirmDisabled={isRecovering}
        onConfirm={handleDeleteSavedUpload}
        variant="danger"
      />
    </Dialog>
  );
}
