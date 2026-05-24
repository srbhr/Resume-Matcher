'use client';

import React, { useRef, useState } from 'react';
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
import { formatBytes } from '@/hooks/use-file-upload';
import { uploadResumeBundle } from '@/lib/api/resume';
import { useTranslations } from '@/lib/i18n';

interface ResumeUploadDialogProps {
  trigger?: React.ReactNode | null;
  onUploadComplete?: (resumeId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
];
const ACCEPT_ATTR = ACCEPTED_FILE_TYPES.join(',');
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File "${file.name}" exceeds the maximum size of ${formatBytes(MAX_FILE_SIZE)}.`;
  }
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  const fileExtension = `.${fileName.split('.').pop()}`;
  const accepted =
    ACCEPTED_FILE_TYPES.includes(fileType) || ['.pdf', '.doc', '.docx'].includes(fileExtension);
  if (!accepted) {
    return `File "${file.name}" type not accepted. Accepted types: PDF, DOC, DOCX.`;
  }
  return null;
}

type Slot = 'resume' | 'cv';

interface SlotInputProps {
  label: string;
  hint: string;
  file: File | null;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}

function FileSlot({ label, hint, file, onPick, disabled }: SlotInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslations();

  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[11px] font-bold tracking-[0.08em] uppercase text-ink">
          {label}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel-grey">
          {hint}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.files?.[0] ?? null;
          onPick(next);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      {file ? (
        <div className="flex items-center justify-between gap-3 border border-border bg-paper-tint px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileIcon className="w-4 h-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{file.name}</p>
              <p className="font-mono text-[10px] text-steel-grey">{formatBytes(file.size)}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={() => onPick(null)}
            className="hover:bg-red-100 text-red-600 rounded-none h-7 w-7"
            aria-label={t('a11y.removeFile')}
            title={t('a11y.removeFile')}
          >
            <XIcon className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="w-full border border-dashed border-steel-grey px-3 py-3 text-left font-mono text-[11px] uppercase tracking-[0.08em] text-steel-grey hover:border-border hover:text-ink hover:bg-paper-tint transition-colors disabled:opacity-50"
        >
          {t('dashboard.uploadDialog.chooseFile')}
        </button>
      )}
    </div>
  );
}

export function ResumeUploadDialog({
  trigger,
  onUploadComplete,
  open: controlledOpen,
  onOpenChange,
}: ResumeUploadDialogProps) {
  const { t } = useTranslations();
  const [internalOpen, setInternalOpen] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [groupName, setGroupName] = useState('');
  const [resumeFilename, setResumeFilename] = useState('Resume.pdf');
  const [cvFilename, setCvFilename] = useState('CV.pdf');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const resetState = () => {
    setResumeFile(null);
    setCvFile(null);
    setGroupName('');
    setResumeFilename('Resume.pdf');
    setCvFilename('CV.pdf');
    setValidationError(null);
    setSubmitError(null);
    setSuccessMessage(null);
  };

  const handlePick = (slot: Slot, file: File | null) => {
    setSubmitError(null);
    setSuccessMessage(null);
    if (file) {
      const err = validateFile(file);
      if (err) {
        setValidationError(err);
        return;
      }
    }
    setValidationError(null);
    if (slot === 'resume') setResumeFile(file);
    else setCvFile(file);
  };

  const canSubmit = !isUploading && (resumeFile !== null || cvFile !== null);

  const handleSubmit = async () => {
    if (!resumeFile && !cvFile) {
      setSubmitError(t('dashboard.uploadDialog.requireOne'));
      return;
    }
    setIsUploading(true);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const result = await uploadResumeBundle({
        resumeFile,
        cvFile,
        groupName: groupName.trim() || undefined,
        resumeFilename: resumeFilename.trim() || undefined,
        cvFilename: cvFilename.trim() || undefined,
      });
      setSuccessMessage(t('dashboard.uploadDialog.successMaster'));
      setTimeout(() => {
        onUploadComplete?.(result.resume_id);
      }, 0);
      setTimeout(() => {
        setIsOpen(false);
        resetState();
      }, 1200);
    } catch (err) {
      console.error('Bundle upload failed:', err);
      setSubmitError(err instanceof Error ? err.message : t('dashboard.uploadDialog.failed'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) resetState();
        setIsOpen(next);
      }}
    >
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button className="rounded-none border border-border shadow-sw-default hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all">
              <UploadIcon className="w-4 h-4 mr-2" />
              {t('dashboard.uploadResume')}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg bg-background border border-border shadow-sw-lg p-0 gap-0 rounded-none">
        <DialogHeader className="p-6 border-b border-border bg-card">
          <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight">
            {t('dashboard.uploadDialog.bundleTitle')}
          </DialogTitle>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-steel-grey mt-1">
            {t('dashboard.uploadDialog.bundleSubtitle')}
          </p>
        </DialogHeader>

        <div className="p-6 bg-background space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <label
              htmlFor="upload-group-name"
              className="block font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink mb-1"
            >
              {t('dashboard.uploadDialog.groupNameLabel')}
            </label>
            <input
              id="upload-group-name"
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={80}
              placeholder={t('dashboard.uploadDialog.groupNamePlaceholder')}
              disabled={isUploading}
              className="w-full border border-border bg-card px-3 py-2 font-sans text-sm rounded-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="font-mono text-[10px] text-steel-grey mt-1">
              {t('dashboard.uploadDialog.groupNameHint')}
            </p>
          </div>

          <FileSlot
            label={t('dashboard.uploadDialog.resumeSlotLabel')}
            hint={t('dashboard.uploadDialog.optional')}
            file={resumeFile}
            onPick={(f) => handlePick('resume', f)}
            disabled={isUploading}
          />

          <div>
            <label
              htmlFor="upload-resume-filename"
              className="block font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink mb-1"
            >
              {t('dashboard.uploadDialog.resumeFilenameLabel')}
            </label>
            <input
              id="upload-resume-filename"
              type="text"
              value={resumeFilename}
              onChange={(e) => setResumeFilename(e.target.value)}
              placeholder="Resume.pdf"
              disabled={isUploading}
              className="w-full border border-border bg-card px-3 py-2 font-mono text-sm rounded-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <FileSlot
            label={t('dashboard.uploadDialog.cvSlotLabel')}
            hint={t('dashboard.uploadDialog.optional')}
            file={cvFile}
            onPick={(f) => handlePick('cv', f)}
            disabled={isUploading}
          />

          <div>
            <label
              htmlFor="upload-cv-filename"
              className="block font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink mb-1"
            >
              {t('dashboard.uploadDialog.cvFilenameLabel')}
            </label>
            <input
              id="upload-cv-filename"
              type="text"
              value={cvFilename}
              onChange={(e) => setCvFilename(e.target.value)}
              placeholder="CV.pdf"
              disabled={isUploading}
              className="w-full border border-border bg-card px-3 py-2 font-mono text-sm rounded-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel-grey">
            {t('dashboard.uploadDialog.dropzoneSubtitle')} ·{' '}
            {t('dashboard.uploadDialog.requireOne')}
          </p>

          {validationError && (
            <div className="p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-red-700 text-sm">
              <AlertCircleIcon className="w-5 h-5 shrink-0" />
              <p>{validationError}</p>
            </div>
          )}

          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-red-700 text-sm">
              <AlertCircleIcon className="w-5 h-5 shrink-0" />
              <p>{submitError}</p>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-green-50 border border-green-200 flex items-center gap-2 text-green-700 text-sm font-bold">
              <CheckCircle2Icon className="w-5 h-5 shrink-0" />
              <p>{successMessage}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-card flex justify-end gap-2">
          <DialogClose asChild>
            <Button
              variant="outline"
              className="rounded-none border-border hover:bg-paper-tint"
              disabled={isUploading}
            >
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-none border border-border shadow-sw-default hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
          >
            {isUploading ? (
              <>
                <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                {t('common.uploading')}
              </>
            ) : (
              <>
                <UploadIcon className="w-4 h-4 mr-2" />
                {t('dashboard.uploadDialog.uploadButton')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
