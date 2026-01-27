'use client';

import React, { useState } from 'react';
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

interface ResumeUploadDialogProps {
  trigger?: React.ReactNode;
  onUploadComplete?: (resumeId: string) => void;
}

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
];
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

export function ResumeUploadDialog({ trigger, onUploadComplete }: ResumeUploadDialogProps) {
  const { t } = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const UPLOAD_URL = getUploadUrl();

  const [
    { files, isDragging, errors, isUploadingGlobal },
    {
      getInputProps,
      openFileDialog,
      removeFile,
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
      const data = response as { resume_id?: string };
      if (data.resume_id) {
        setUploadFeedback({
          type: 'success',
          message: t('dashboard.uploadDialog.success'),
        });
        // Defer parent state update to avoid setState during render
        const resumeId = data.resume_id;
        setTimeout(() => {
          onUploadComplete?.(resumeId);
        }, 0);
        // Close dialog after a short delay to show success state
        setTimeout(() => {
          setIsOpen(false);
          setUploadFeedback(null);
          removeFile(uploadedFile.id); // Clear file for next time
        }, 1500);
      } else {
        setUploadFeedback({
          type: 'error',
          message: t('dashboard.uploadDialog.successMissingId'),
        });
      }
    },
    onUploadError: (file, errorMsg) => {
      setUploadFeedback({
        type: 'error',
        message: errorMsg || t('dashboard.uploadDialog.failed'),
      });
    },
    onFilesChange: (currentFiles) => {
      if (currentFiles.length === 0) setUploadFeedback(null);
    },
  });

  const currentFile = files[0];
  const displayErrors = uploadFeedback?.type === 'error' ? [uploadFeedback.message] : errors;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-none border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all">
            <UploadIcon className="w-4 h-4 mr-2" />
            {t('dashboard.uploadResume')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-[#F0F0E8] border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] p-0 gap-0 rounded-none">
        <DialogHeader className="p-6 border-b border-black bg-white">
          <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight">
            {t('dashboard.uploadResume')}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 bg-[#F0F0E8]">
          <div
            className={`
                            relative border-2 border-dashed p-8 text-center transition-all duration-200
                            ${isDragging ? 'border-blue-700 bg-blue-50' : 'border-gray-400 hover:border-black hover:bg-white'}
                            ${currentFile ? 'bg-white border-solid border-black' : ''}
                            cursor-pointer
                        `}
            onClick={!currentFile ? openFileDialog : undefined}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
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
                  <div className="w-10 h-10 border border-black bg-gray-100 flex items-center justify-center shrink-0">
                    <FileIcon className="w-5 h-5 text-black" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate max-w-[200px]">
                      {currentFile.file.name}
                    </p>
                    <p className="font-mono text-xs text-gray-500">
                      {formatBytes(currentFile.file.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(currentFile.id);
                  }}
                  className="hover:bg-red-100 text-red-600 rounded-none"
                >
                  <XIcon className="w-5 h-5" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4">
                <div className="w-12 h-12 border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] flex items-center justify-center mb-4">
                  <UploadIcon className="w-6 h-6 text-black" />
                </div>
                <p className="font-bold text-lg mb-1">
                  {t('dashboard.uploadDialog.dropzoneTitle')}
                </p>
                <p className="font-mono text-xs text-gray-500 uppercase">
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

          {uploadFeedback?.type === 'success' && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 flex items-center gap-2 text-green-700 text-sm font-bold">
              <CheckCircle2Icon className="w-5 h-5 shrink-0" />
              <p>{uploadFeedback.message}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-black bg-white flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-none border-black hover:bg-gray-100">
              {t('common.cancel')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
