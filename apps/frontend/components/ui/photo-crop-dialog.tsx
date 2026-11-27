'use client';

import './ui-sdk.css';
import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, MagnifyingGlassPlus } from '@phosphor-icons/react';
import {
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ui-sdk/react/dialog';
import { cropImage } from '@ui-sdk/react/image';
import {
  ImageCropper,
  ImageCropperGrid,
  ImageCropperImage,
  ImageCropperRotate,
  ImageCropperSelection,
  ImageCropperViewport,
  ImageCropperZoom,
  type ImageCrop,
} from '@ui-sdk/react/image-cropper';
import { Button, buttonClass } from './button';

export interface PhotoCropLabels {
  title: string;
  hint: string;
  imageAlt: string;
  zoom: string;
  rotate: string;
  apply: string;
  cancel: string;
  /** Said when the photo can't be read or cropped. */
  failed: string;
}

interface PhotoCropDialogProps {
  file: File;
  /** Width over height of the frame, like 35 / 45 for a CV photo. */
  aspectRatio: number;
  /** Width of the cropped JPEG, in pixels. */
  outputWidth: number;
  labels: PhotoCropLabels;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

/**
 * Crop a photo before it's used: ui-sdk's Image Cropper in frame mode, in its
 * Dialog. The frame stays still at `aspectRatio`; drag the photo under it,
 * zoom with the slider, wheel or pinch, and turn it a quarter. "Use photo"
 * hands back a JPEG of the framed part. Swiss: square, ink, hard shadow.
 */
export function PhotoCropDialog({
  file,
  aspectRatio,
  outputWidth,
  labels,
  onCancel,
  onCropped,
}: PhotoCropDialogProps) {
  // The object URL is made and revoked by the same effect, so a re-run (React's
  // dev double-mount) makes a fresh one instead of keeping a revoked one.
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const [crop, setCrop] = useState<ImageCrop>();
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  // Closing the dialog while a crop is still being made drops its result.
  const closedRef = useRef(false);

  const cancel = () => {
    closedRef.current = true;
    onCancel();
  };

  const apply = async () => {
    if (!crop) return;
    setWorking(true);
    setFailed(false);
    try {
      const cropped = await cropImage(file, crop, {
        type: 'image/jpeg',
        quality: 0.92,
        width: outputWidth,
      });
      if (closedRef.current) return;
      const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
      onCropped(new File([cropped], name, { type: 'image/jpeg' }));
    } catch (error) {
      console.error('Failed to crop the photo:', error);
      if (!closedRef.current) setFailed(true);
    } finally {
      if (!closedRef.current) setWorking(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <DialogBackdrop />
      <DialogContent className="w-[min(30rem,calc(100%-2rem))] gap-4 border border-ink bg-white p-6 shadow-sw-lg">
        <DialogTitle className="font-serif text-xl font-bold text-ink">{labels.title}</DialogTitle>
        <DialogDescription className="text-sm text-ink-soft">{labels.hint}</DialogDescription>
        <ImageCropper
          aria-label={labels.title}
          src={src ?? undefined}
          mode="frame"
          aspectRatio={aspectRatio}
          maxZoom={4}
          crop={crop}
          onCropChange={setCrop}
          className="flex max-w-none flex-col gap-4"
        >
          <ImageCropperViewport className="h-80 border border-ink bg-panel">
            <ImageCropperImage alt={labels.imageAlt} onError={() => setFailed(true)} />
            <ImageCropperSelection className="border-2 border-white outline outline-1 outline-ink">
              <ImageCropperGrid />
            </ImageCropperSelection>
          </ImageCropperViewport>
          <div className="flex items-center gap-3">
            <MagnifyingGlassPlus aria-hidden="true" className="size-4 shrink-0 text-ink" />
            <ImageCropperZoom aria-label={labels.zoom} className="min-w-0 flex-1 accent-ink" />
            <ImageCropperRotate
              aria-label={labels.rotate}
              className={buttonClass({ variant: 'outline', size: 'icon-sm' })}
            >
              <ArrowClockwise aria-hidden="true" />
            </ImageCropperRotate>
          </div>
        </ImageCropper>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {labels.failed}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={cancel}>
            {labels.cancel}
          </Button>
          <Button type="button" disabled={!crop || working} onClick={() => void apply()}>
            {labels.apply}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
