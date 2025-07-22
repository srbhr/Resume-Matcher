'use client';

import React, { useState, useCallback } from 'react';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PaperclipIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { formatBytes, useFileUpload, type FileMetadata } from '@/hooks/use-file-upload';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

const acceptedFileTypes = [
  'application/pdf', // .pdf
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];

const acceptString = acceptedFileTypes.join(',');

export default function FileUpload() {
  const router = useRouter();
  const maxSize = 2 * 1024 * 1024; // 2MB
  const API_RESUME_UPLOAD_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/resumes/upload`;

  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleUploadSuccess = useCallback((uploadedFile: any, response: any) => {
    const data = response as Record<string, unknown> & { resume_id?: string };
    const resumeId = typeof data.resume_id === 'string' ? data.resume_id : undefined;

    if (!resumeId) {
      console.error('Missing resume_id in upload response', response);
      setUploadFeedback({
        type: 'error',
        message: 'Upload succeeded but no resume ID received.',
      });
      return;
    }

    setUploadFeedback({
      type: 'success',
      message: `${(uploadedFile.file as FileMetadata).name} uploaded successfully!`,
    });
    
    clearErrors();
    const encodedResumeId = encodeURIComponent(resumeId);
    router.push(`/jobs?resume_id=${encodedResumeId}`);
  }, [router]);

  const [
    { files, isDragging, errors: validationOrUploadErrors, isUploadingGlobal },
    {
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      removeFile,
      getInputProps,
      clearErrors,
    },
  ] = useFileUpload({
    maxSize,
    accept: acceptString,
    multiple: false,
    uploadUrl: API_RESUME_UPLOAD_URL,
    onUploadSuccess: handleUploadSuccess,
    onUploadError: (file, error) => {
      setUploadFeedback({
        type: 'error',
        message: `Upload failed: ${error}`,
      });
    },
    onFilesChange: (currentFiles) => {
      if (currentFiles.length === 0) {
        setUploadFeedback(null);
      }
    },
  });

  const currentFile = files[0];

  const handleRemoveFile = (id: string) => {
    removeFile(id);
    setUploadFeedback(null);
  };

  const displayErrors =
    uploadFeedback?.type === 'error' ? [uploadFeedback.message] : validationOrUploadErrors;

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg">
      <div
        role="button"
        tabIndex={!currentFile && !isUploadingGlobal ? 0 : -1}
        onClick={!currentFile && !isUploadingGlobal ? openFileDialog : undefined}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !currentFile && !isUploadingGlobal)
            openFileDialog();
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/25',
          !currentFile && !isUploadingGlobal
            ? 'cursor-pointer hover:border-primary/50 hover:bg-primary/5'
            : 'cursor-default'
        )}
      >
        <input {...getInputProps()} />
        {isUploadingGlobal ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Uploading file...</p>
          </div>
        ) : currentFile ? (
          <div className="flex w-full flex-col items-center gap-2">
            <PaperclipIcon className="h-8 w-8 text-muted-foreground" />
            <div className="flex w-full items-center justify-between">
              <div className="flex-1 overflow-hidden text-left">
                <p className="truncate text-sm font-medium text-foreground">
                  {(currentFile.file as FileMetadata).name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes((currentFile.file as FileMetadata).size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile(currentFile.id);
                }}
                className="h-8 w-8 rounded-full"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <UploadIcon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                <span className="text-primary">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">
                {acceptedFileTypes.map((ext) => ext.split('/').pop()?.toUpperCase()).join(', ')} (max{' '}
                {formatBytes(maxSize)})
              </p>
            </div>
          </div>
        )}
      </div>

      {displayErrors.length > 0 && !isUploadingGlobal && (
        <div
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Error</p>
              {displayErrors.map((error, index) => (
                <p key={index}>{error}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {uploadFeedback?.type === 'success' && !isUploadingGlobal && (
        <div
          className="rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600"
          role="status"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="h-4 w-4 shrink-0" />
            <p>{uploadFeedback.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}