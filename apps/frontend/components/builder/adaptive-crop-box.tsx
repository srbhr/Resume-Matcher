'use client';

import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import styles from './adaptive-crop-box.module.css';

export interface CropRect {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const MIN_EDGE = 5;
const HANDLES: CropHandle[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function moveCrop(crop: CropRect, deltaX: number, deltaY: number): CropRect {
  return {
    ...crop,
    cropX: clamp(crop.cropX + deltaX, 0, 100 - crop.cropWidth),
    cropY: clamp(crop.cropY + deltaY, 0, 100 - crop.cropHeight),
  };
}

function resizeEdge(
  crop: CropRect,
  handle: Exclude<CropHandle, 'nw' | 'ne' | 'sw' | 'se'>,
  deltaX: number,
  deltaY: number
): CropRect {
  const right = crop.cropX + crop.cropWidth;
  const bottom = crop.cropY + crop.cropHeight;
  if (handle === 'w') {
    const cropX = clamp(crop.cropX + deltaX, 0, right - MIN_EDGE);
    return { ...crop, cropX, cropWidth: right - cropX };
  }
  if (handle === 'e') {
    return {
      ...crop,
      cropWidth: clamp(crop.cropWidth + deltaX, MIN_EDGE, 100 - crop.cropX),
    };
  }
  if (handle === 'n') {
    const cropY = clamp(crop.cropY + deltaY, 0, bottom - MIN_EDGE);
    return { ...crop, cropY, cropHeight: bottom - cropY };
  }
  return {
    ...crop,
    cropHeight: clamp(crop.cropHeight + deltaY, MIN_EDGE, 100 - crop.cropY),
  };
}

function resizeCorner(
  crop: CropRect,
  handle: Extract<CropHandle, 'nw' | 'ne' | 'sw' | 'se'>,
  deltaX: number,
  deltaY: number
): CropRect {
  const growsEast = handle.endsWith('e');
  const growsSouth = handle.startsWith('s');
  const horizontalScale = (crop.cropWidth + (growsEast ? deltaX : -deltaX)) / crop.cropWidth;
  const verticalScale = (crop.cropHeight + (growsSouth ? deltaY : -deltaY)) / crop.cropHeight;
  const desiredScale =
    Math.abs(horizontalScale - 1) >= Math.abs(verticalScale - 1) ? horizontalScale : verticalScale;
  const right = crop.cropX + crop.cropWidth;
  const bottom = crop.cropY + crop.cropHeight;
  const maximumScale = Math.min(
    growsEast ? (100 - crop.cropX) / crop.cropWidth : right / crop.cropWidth,
    growsSouth ? (100 - crop.cropY) / crop.cropHeight : bottom / crop.cropHeight
  );
  const minimumScale = Math.max(MIN_EDGE / crop.cropWidth, MIN_EDGE / crop.cropHeight);
  const scale = clamp(desiredScale, minimumScale, maximumScale);
  const cropWidth = crop.cropWidth * scale;
  const cropHeight = crop.cropHeight * scale;

  return {
    cropX: growsEast ? crop.cropX : right - cropWidth,
    cropY: growsSouth ? crop.cropY : bottom - cropHeight,
    cropWidth,
    cropHeight,
  };
}

export function resizeCrop(
  crop: CropRect,
  handle: CropHandle,
  deltaX: number,
  deltaY: number
): CropRect {
  if (handle === 'n' || handle === 's' || handle === 'e' || handle === 'w') {
    return resizeEdge(crop, handle, deltaX, deltaY);
  }
  return resizeCorner(crop, handle, deltaX, deltaY);
}

interface AdaptiveCropBoxProps {
  imageUrl: string;
  value: CropRect;
  onChange: (crop: CropRect) => void;
  imageAlt?: string;
  disabled?: boolean;
  moveLabel: string;
  handleLabels: Record<CropHandle, string>;
}

interface DragState {
  mode: 'move' | CropHandle;
  startX: number;
  startY: number;
  crop: CropRect;
  bounds: DOMRect;
}

export function AdaptiveCropBox({
  imageUrl,
  value,
  onChange,
  imageAlt = '',
  disabled = false,
  moveLabel,
  handleLabels,
}: AdaptiveCropBoxProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const startDrag = (mode: DragState['mode']) => (event: ReactPointerEvent<HTMLElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      crop: value,
      bounds,
    };
  };

  const continueDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (disabled) return;
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = ((event.clientX - drag.startX) / drag.bounds.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / drag.bounds.height) * 100;
    onChange(
      drag.mode === 'move'
        ? moveCrop(drag.crop, deltaX, deltaY)
        : resizeCrop(drag.crop, drag.mode, deltaX, deltaY)
    );
  };

  const stopDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const keyboardDelta = (event: ReactKeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowLeft') return { deltaX: -step, deltaY: 0 };
    if (event.key === 'ArrowRight') return { deltaX: step, deltaY: 0 };
    if (event.key === 'ArrowUp') return { deltaX: 0, deltaY: -step };
    if (event.key === 'ArrowDown') return { deltaX: 0, deltaY: step };
    return null;
  };

  const moveWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.currentTarget !== event.target) return;
    const delta = keyboardDelta(event);
    if (!delta) return;
    event.preventDefault();
    onChange(moveCrop(value, delta.deltaX, delta.deltaY));
  };

  const resizeWithKeyboard =
    (handle: CropHandle) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const delta = keyboardDelta(event);
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      onChange(resizeCrop(value, handle, delta.deltaX, delta.deltaY));
    };

  return (
    <div className={styles.viewport}>
      <div ref={stageRef} className={styles.stage}>
        {/* The backend already normalizes orientation and strips metadata. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={imageAlt} className={styles.sourceImage} draggable={false} />
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={moveLabel}
          className={styles.crop}
          style={{
            left: `${value.cropX}%`,
            top: `${value.cropY}%`,
            width: `${value.cropWidth}%`,
            height: `${value.cropHeight}%`,
          }}
          onPointerDown={startDrag('move')}
          onPointerMove={continueDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onKeyDown={moveWithKeyboard}
        >
          <div className={styles.grid} aria-hidden="true" />
          {HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              aria-label={handleLabels[handle]}
              disabled={disabled}
              className={`${styles.handle} ${styles[handle]}`}
              onPointerDown={startDrag(handle)}
              onPointerMove={continueDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              onKeyDown={resizeWithKeyboard(handle)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
