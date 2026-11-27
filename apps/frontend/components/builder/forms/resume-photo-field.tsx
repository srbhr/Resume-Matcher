'use client';

import React, { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api/client';
import {
  RESUME_PHOTO_MAX_BYTES,
  RESUME_PHOTO_TYPES,
  deleteResumePhoto,
  uploadResumePhoto,
} from '@/lib/api/resume';
import { useTranslations } from '@/lib/i18n';

// The crop dialog (ui-sdk's Image Cropper and Dialog) loads when a photo is chosen.
const PhotoCropDialog = dynamic(
  () => import('@/components/ui/photo-crop-dialog').then((m) => m.PhotoCropDialog),
  { ssr: false }
);

/** The templates show the photo at 35:45; 600 px wide is sharp in a PDF. */
const PHOTO_ASPECT = 35 / 45;
const PHOTO_WIDTH = 600;

/** Browsers that can't decode an image for cropping upload the original. */
const canCrop = (): boolean => typeof createImageBitmap === 'function';

interface ResumePhotoFieldProps {
  resumeId: string;
  photo: string | null;
  /** Called with the stored photo after an upload, or null after a removal. */
  onChange: (photo: string | null) => void;
}

/** Upload, replace or remove the resume's photo (photo CVs). Saves at once. */
export const ResumePhotoField: React.FC<ResumePhotoFieldProps> = ({
  resumeId,
  photo,
  onChange,
}) => {
  const { t } = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (!(RESUME_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setError(t('resume.personalInfo.photo.errors.unsupported'));
      return;
    }
    if (file.size > RESUME_PHOTO_MAX_BYTES) {
      setError(t('resume.personalInfo.photo.errors.tooLarge'));
      return;
    }
    setError(null);
    if (canCrop()) {
      setCropping(file);
      return;
    }
    await upload(file);
  };

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      onChange(await uploadResumePhoto(resumeId, file));
    } catch (err) {
      console.error('Failed to upload the resume photo:', err);
      const status = err instanceof ApiError ? err.status : 0;
      setError(
        t(
          status === 413
            ? 'resume.personalInfo.photo.errors.tooLarge'
            : status === 422
              ? 'resume.personalInfo.photo.errors.unsupported'
              : 'resume.personalInfo.photo.errors.failed'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setBusy(true);
    try {
      await deleteResumePhoto(resumeId);
      onChange(null);
    } catch (err) {
      console.error('Failed to remove the resume photo:', err);
      setError(t('resume.personalInfo.photo.errors.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-ink pt-4">
      <Label>{t('resume.personalInfo.photo.label')}</Label>
      <div className="flex items-start gap-4">
        {photo && (
          // oxlint-disable-next-line nextjs/no-img-element -- a data URL from our own API; next/image adds nothing here
          <img
            src={photo}
            alt={t('resume.personalInfo.photo.previewAlt')}
            className="w-16 aspect-[35/45] object-cover border border-ink"
          />
        )}
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={RESUME_PHOTO_TYPES.join(',')}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => void handleFile(e.target.files?.[0])}
            data-testid="resume-photo-input"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy
                ? t('resume.personalInfo.photo.uploading')
                : t(photo ? 'resume.personalInfo.photo.change' : 'resume.personalInfo.photo.add')}
            </Button>
            {photo && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void handleRemove()}
              >
                {t('resume.personalInfo.photo.remove')}
              </Button>
            )}
          </div>
          <p className="text-xs text-steel">{t('resume.personalInfo.photo.hint')}</p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
      {cropping && (
        <PhotoCropDialog
          file={cropping}
          aspectRatio={PHOTO_ASPECT}
          outputWidth={PHOTO_WIDTH}
          labels={{
            title: t('resume.personalInfo.photo.crop.title'),
            hint: t('resume.personalInfo.photo.crop.hint'),
            imageAlt: t('resume.personalInfo.photo.previewAlt'),
            zoom: t('resume.personalInfo.photo.crop.zoom'),
            rotate: t('resume.personalInfo.photo.crop.rotate'),
            apply: t('resume.personalInfo.photo.crop.apply'),
            cancel: t('resume.personalInfo.photo.crop.cancel'),
          }}
          onCancel={() => setCropping(null)}
          onCropped={(cropped) => {
            setCropping(null);
            void upload(cropped);
          }}
        />
      )}
    </div>
  );
};
