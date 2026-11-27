'use client';

import './ui-sdk.css';
import { useEffect, useMemo, useState } from 'react';
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
  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  const [crop, setCrop] = useState<ImageCrop>();
  const [working, setWorking] = useState(false);

  const apply = async () => {
    if (!crop) return;
    setWorking(true);
    try {
      const cropped = await cropImage(file, crop, {
        type: 'image/jpeg',
        quality: 0.92,
        width: outputWidth,
      });
      const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
      onCropped(new File([cropped], name, { type: 'image/jpeg' }));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogBackdrop />
      <DialogContent className="w-[min(30rem,calc(100%-2rem))] gap-4 border border-ink bg-white p-6 shadow-sw-lg">
        <DialogTitle className="font-serif text-xl font-bold text-ink">{labels.title}</DialogTitle>
        <DialogDescription className="text-sm text-ink-soft">{labels.hint}</DialogDescription>
        <ImageCropper
          aria-label={labels.title}
          src={src}
          mode="frame"
          aspectRatio={aspectRatio}
          maxZoom={4}
          crop={crop}
          onCropChange={setCrop}
          className="flex max-w-none flex-col gap-4"
        >
          <ImageCropperViewport className="h-80 border border-ink bg-panel">
            <ImageCropperImage alt={labels.imageAlt} />
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
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
