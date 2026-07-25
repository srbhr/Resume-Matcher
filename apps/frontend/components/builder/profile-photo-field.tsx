'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Pencil, Replace, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { PhotoMutation, ResumePhotoSettings } from '@/components/dashboard/resume-component';
import { getResumePhotoSourceUrl, getResumePhotoUrl } from '@/lib/api/resume';
import { useTranslations } from '@/lib/i18n';

const ProfilePhotoEditorDialog = dynamic(
  () =>
    import('./profile-photo-editor-dialog').then((module) => ({
      default: module.ProfilePhotoEditorDialog,
    })),
  { ssr: false }
);

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

interface ProfilePhotoFieldProps {
  resumeId?: string | null;
  name?: string;
  photo?: ResumePhotoSettings;
  onUpload: (file: File, mutation: PhotoMutation) => Promise<void>;
  onEdit: (mutation: PhotoMutation) => Promise<void>;
  onRemove: () => Promise<void>;
  onEditorOpenChange?: (open: boolean) => void;
  editRequestToken?: number;
  disabled?: boolean;
}

export function ProfilePhotoField({
  resumeId,
  name,
  photo,
  onUpload,
  onEdit,
  onRemove,
  onEditorOpenChange,
  editRequestToken = 0,
  disabled = false,
}: ProfilePhotoFieldProps) {
  const { t } = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastEditRequestRef = useRef(editRequestToken);
  const objectUrlRef = useRef<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const setOpen = (open: boolean) => {
    setEditorOpen(open);
    onEditorOpenChange?.(open);
    if (!open) {
      setError(null);
      setPendingFile(null);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setSourceUrl(null);
    }
  };

  const validateFile = (file: File): string | null => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_PHOTO_TYPES.has(file.type) || !ALLOWED_PHOTO_EXTENSIONS.has(extension)) {
      return t('resume.photo.errors.format');
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return t('resume.photo.errors.size');
    }
    return null;
  };

  const openFile = (file: File) => {
    if (disabled) return;
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!resumeId) {
      setError(t('resume.photo.errors.saveRequired'));
      return;
    }
    setError(null);
    setPendingFile(file);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setSourceUrl(objectUrl);
    setOpen(true);
  };

  const openExisting = () => {
    if (disabled || !resumeId || !photo) return;
    setPendingFile(null);
    setSourceUrl(getResumePhotoSourceUrl(resumeId, photo.version));
    setOpen(true);
  };

  useEffect(() => {
    if (editRequestToken === lastEditRequestRef.current) return;
    lastEditRequestRef.current = editRequestToken;
    if (!disabled && photo && resumeId) {
      setPendingFile(null);
      setSourceUrl(getResumePhotoSourceUrl(resumeId, photo.version));
      setEditorOpen(true);
      onEditorOpenChange?.(true);
    }
  }, [disabled, editRequestToken, onEditorOpenChange, photo, resumeId]);

  const handleApply = async (mutation: PhotoMutation) => {
    setApplying(true);
    setError(null);
    try {
      if (pendingFile) {
        await onUpload(pendingFile, mutation);
      } else {
        await onEdit(mutation);
      }
      setOpen(false);
    } catch (cause) {
      console.error('Failed to save resume photo:', cause);
      setError(t('resume.photo.errors.save'));
    } finally {
      setApplying(false);
    }
  };

  const handleRemove = async () => {
    setApplying(true);
    try {
      await onRemove();
      setRemoveOpen(false);
    } catch (cause) {
      console.error('Failed to remove resume photo:', cause);
      setError(t('resume.photo.errors.save'));
    } finally {
      setApplying(false);
    }
  };

  const dropHandlers = {
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => event.preventDefault(),
    onDrop: (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file) openFile(file);
    },
  };

  return (
    <div className="space-y-3">
      <div className="font-mono text-xs uppercase tracking-wider text-steel-grey">
        {t('resume.photo.label')}
      </div>
      {photo && resumeId ? (
        <div className="flex items-center gap-4 border border-black bg-background p-4">
          <Image
            src={getResumePhotoUrl(resumeId, photo.version)}
            alt={t('resume.photo.alt', { name: name || t('resume.defaults.name') })}
            width={80}
            height={80}
            unoptimized
            className="h-20 w-20 border border-black object-cover"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openExisting}
              disabled={disabled}
            >
              <Pencil className="h-4 w-4" />
              {t('resume.photo.edit')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              <Replace className="h-4 w-4" />
              {t('resume.photo.replace')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setRemoveOpen(true)}
              disabled={disabled}
            >
              <Trash2 className="h-4 w-4" />
              {t('resume.photo.remove')}
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={t('resume.photo.add')}
          className="flex min-h-28 cursor-pointer items-center gap-4 border-2 border-black bg-background p-4 focus:outline-none focus:ring-2 focus:ring-blue-700"
          onClick={() => {
            if (!disabled) inputRef.current?.click();
          }}
          onKeyDown={(event) => {
            if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          {...dropHandlers}
        >
          <div className="flex h-16 w-16 items-center justify-center border border-black bg-white">
            <ImagePlus className="h-7 w-7" />
          </div>
          <div>
            <div className="font-mono text-sm font-bold uppercase">{t('resume.photo.add')}</div>
            <div className="mt-1 text-sm text-ink-soft">{t('resume.photo.helper')}</div>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        aria-label={photo ? t('resume.photo.replace') : t('resume.photo.add')}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) openFile(file);
          event.target.value = '';
        }}
      />

      {error && !editorOpen && (
        <div role="alert" className="border-2 border-red-600 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      <ProfilePhotoEditorDialog
        open={editorOpen}
        sourceUrl={sourceUrl}
        initialSettings={pendingFile ? undefined : photo}
        applying={applying || disabled}
        error={error}
        onOpenChange={setOpen}
        onApply={handleApply}
      />

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t('resume.photo.remove')}
        description={t('resume.photo.removeConfirm')}
        confirmLabel={t('resume.photo.remove')}
        variant="danger"
        confirmDisabled={applying || disabled}
        closeOnConfirm={false}
        onConfirm={handleRemove}
      />
    </div>
  );
}
