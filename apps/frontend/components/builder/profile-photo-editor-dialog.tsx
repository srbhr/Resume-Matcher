'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PhotoMutation, ResumePhotoSettings } from '@/components/dashboard/resume-component';
import { AdaptiveCropBox, type CropRect } from '@/components/builder/adaptive-crop-box';
import { useTranslations } from '@/lib/i18n';

const DEFAULT_SIZE = 88;
const FULL_IMAGE_CROP: CropRect = {
  cropX: 0,
  cropY: 0,
  cropWidth: 100,
  cropHeight: 100,
};

interface ProfilePhotoEditorDialogProps {
  open: boolean;
  sourceUrl: string | null;
  initialSettings?: ResumePhotoSettings;
  applying?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onApply: (mutation: PhotoMutation) => Promise<void>;
}

export function ProfilePhotoEditorDialog({
  open,
  sourceUrl,
  initialSettings,
  applying = false,
  error,
  onOpenChange,
  onApply,
}: ProfilePhotoEditorDialogProps) {
  const { t } = useTranslations();
  const [size, setSize] = useState(initialSettings?.size ?? DEFAULT_SIZE);
  const [crop, setCrop] = useState<CropRect>(FULL_IMAGE_CROP);

  const initialCrop = useMemo<CropRect>(() => {
    if (!initialSettings) return FULL_IMAGE_CROP;
    return {
      cropX: initialSettings.cropX,
      cropY: initialSettings.cropY,
      cropWidth: initialSettings.cropWidth,
      cropHeight: initialSettings.cropHeight,
    };
  }, [initialSettings]);

  useEffect(() => {
    if (!open) return;
    setCrop(initialCrop);
    setSize(initialSettings?.size ?? DEFAULT_SIZE);
  }, [initialCrop, initialSettings?.size, open]);

  const handleReset = () => {
    setCrop(FULL_IMAGE_CROP);
    setSize(DEFAULT_SIZE);
  };

  const handleApply = async () => {
    await onApply({
      ...crop,
      size,
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (applying && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  const handleLabels = useMemo(
    () => ({
      n: t('resume.photo.cropHandles.n'),
      s: t('resume.photo.cropHandles.s'),
      e: t('resume.photo.cropHandles.e'),
      w: t('resume.photo.cropHandles.w'),
      nw: t('resume.photo.cropHandles.nw'),
      ne: t('resume.photo.cropHandles.ne'),
      sw: t('resume.photo.cropHandles.sw'),
      se: t('resume.photo.cropHandles.se'),
    }),
    [t]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent motion="fade" className="max-w-2xl p-0">
        <DialogHeader className="border-b border-black p-6">
          <DialogTitle className="text-2xl uppercase">{t('resume.photo.dialogTitle')}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {t('resume.photo.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 p-6">
          <div className="border-2 border-black bg-black">
            {sourceUrl && (
              <AdaptiveCropBox
                imageUrl={sourceUrl}
                value={crop}
                onChange={setCrop}
                imageAlt={t('resume.photo.profilePhoto')}
                disabled={applying}
                moveLabel={t('resume.photo.moveCrop')}
                handleLabels={handleLabels}
              />
            )}
          </div>

          <div>
            <label className="space-y-2">
              <span className="block font-mono text-xs uppercase tracking-wider">
                {t('resume.photo.size')}: {size}px
              </span>
              <input
                aria-label={t('resume.photo.size')}
                type="range"
                min="64"
                max="112"
                step="1"
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
                className="w-full accent-blue-700"
              />
            </label>
          </div>

          {error && (
            <div role="alert" className="border-2 border-red-600 bg-red-50 p-3 text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-end gap-3 border-t border-black bg-secondary p-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={applying}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={applying}>
            {t('resume.photo.reset')}
          </Button>
          <Button onClick={handleApply} disabled={applying || !sourceUrl}>
            {applying && <Loader2 className="h-4 w-4 animate-spin" />}
            {applying ? t('resume.photo.applying') : t('common.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
