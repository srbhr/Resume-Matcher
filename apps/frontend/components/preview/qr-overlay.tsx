'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { type QrCodeSettings } from '@/lib/types/template-settings';
import { mmToPx, pxToMm } from '@/lib/constants/page-dimensions';

interface QrOverlayProps {
  qrCode: QrCodeSettings;
  // Page bounds (in mm) — QR coordinates are page-relative, so this is
  // the full page width/height. The QR can be placed anywhere from
  // (0, 0) to (width - size, height - size).
  pageMm: { width: number; height: number };
  // Preview zoom scale — mouse deltas are divided by this so the drag
  // moves the QR by the same number of page-mm regardless of zoom.
  scale: number;
  // If editable, register click/drag/resize and show selection chrome.
  editable: boolean;
  // Whether to show the selection outline + corner handles right now.
  // (Click on QR → true; click outside → false.)
  selected: boolean;
  onSelect?: () => void;
  onChange?: (next: QrCodeSettings) => void;
}

const MIN_SIZE_MM = 10;
const MAX_SIZE_MM = 80;

type DragState =
  | { kind: 'move'; startClientX: number; startClientY: number; startXMm: number; startYMm: number }
  | {
      kind: 'resize';
      corner: 'tl' | 'tr' | 'bl' | 'br';
      startClientX: number;
      startClientY: number;
      startXMm: number;
      startYMm: number;
      startSizeMm: number;
    };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function QrOverlay({
  qrCode,
  pageMm,
  scale,
  editable,
  selected,
  onSelect,
  onChange,
}: QrOverlayProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Local working copy during a gesture, so we don't spam onChange.
  const draftRef = useRef<QrCodeSettings>(qrCode);
  useEffect(() => {
    draftRef.current = qrCode;
  }, [qrCode]);

  const commit = useCallback(
    (next: QrCodeSettings) => {
      draftRef.current = next;
      onChange?.(next);
    },
    [onChange]
  );

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: MouseEvent) => {
      const dxMm = pxToMm((e.clientX - drag.startClientX) / scale);
      const dyMm = pxToMm((e.clientY - drag.startClientY) / scale);

      if (drag.kind === 'move') {
        const size = draftRef.current.sizeMm;
        const xMm = clamp(drag.startXMm + dxMm, 0, Math.max(0, pageMm.width - size));
        const yMm = clamp(drag.startYMm + dyMm, 0, Math.max(0, pageMm.height - size));
        commit({ ...draftRef.current, xMm, yMm });
        return;
      }

      // Resize: enforce 1:1 by using the dominant axis of the delta.
      // Each corner anchors to the opposite corner.
      let delta: number;
      switch (drag.corner) {
        case 'br':
          delta = Math.max(dxMm, dyMm);
          break;
        case 'tr':
          delta = Math.max(dxMm, -dyMm);
          break;
        case 'bl':
          delta = Math.max(-dxMm, dyMm);
          break;
        case 'tl':
        default:
          delta = Math.max(-dxMm, -dyMm);
          break;
      }
      let nextSize = clamp(drag.startSizeMm + delta, MIN_SIZE_MM, MAX_SIZE_MM);
      let nextX = drag.startXMm;
      let nextY = drag.startYMm;
      if (drag.corner === 'tl') {
        nextX = drag.startXMm + (drag.startSizeMm - nextSize);
        nextY = drag.startYMm + (drag.startSizeMm - nextSize);
      } else if (drag.corner === 'tr') {
        nextY = drag.startYMm + (drag.startSizeMm - nextSize);
      } else if (drag.corner === 'bl') {
        nextX = drag.startXMm + (drag.startSizeMm - nextSize);
      }
      const maxX = Math.max(0, pageMm.width - nextSize);
      const maxY = Math.max(0, pageMm.height - nextSize);
      if (nextX < 0) {
        nextSize = clamp(nextSize + nextX, MIN_SIZE_MM, MAX_SIZE_MM);
        nextX = 0;
      } else if (nextX > maxX) {
        nextX = maxX;
      }
      if (nextY < 0) {
        nextSize = clamp(nextSize + nextY, MIN_SIZE_MM, MAX_SIZE_MM);
        nextY = 0;
      } else if (nextY > maxY) {
        nextY = maxY;
      }
      commit({ ...draftRef.current, xMm: nextX, yMm: nextY, sizeMm: nextSize });
    };
    const handleUp = () => setDrag(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [drag, scale, pageMm.width, pageMm.height, commit]);

  const startMove = (e: React.MouseEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.();
    setDrag({
      kind: 'move',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXMm: qrCode.xMm,
      startYMm: qrCode.yMm,
    });
  };

  const startResize = (corner: 'tl' | 'tr' | 'bl' | 'br') => (e: React.MouseEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.();
    setDrag({
      kind: 'resize',
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXMm: qrCode.xMm,
      startYMm: qrCode.yMm,
      startSizeMm: qrCode.sizeMm,
    });
  };

  const sizePx = mmToPx(qrCode.sizeMm);
  const xPx = mmToPx(qrCode.xMm);
  const yPx = mmToPx(qrCode.yMm);

  const showChrome = editable && selected;

  const handle = (
    cursor: string,
    style: React.CSSProperties,
    onDown: (e: React.MouseEvent) => void
  ) => (
    <div
      onMouseDown={onDown}
      style={{
        position: 'absolute',
        width: 10,
        height: 10,
        background: '#1D4ED8',
        border: '1px solid #fff',
        cursor,
        transform: `scale(${1 / scale})`,
        ...style,
      }}
    />
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: yPx,
        left: xPx,
        width: sizePx,
        height: sizePx,
        zIndex: 10,
        outline: showChrome ? '1px dashed #1D4ED8' : 'none',
        cursor: editable ? (drag?.kind === 'move' ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none',
      }}
      onMouseDown={startMove}
    >
      <QRCodeSVG
        value={qrCode.url || ' '}
        level="M"
        includeMargin={false}
        style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
      />
      {showChrome && (
        <>
          {handle(
            'nwse-resize',
            { top: -5, left: -5, transformOrigin: 'top left' },
            startResize('tl')
          )}
          {handle(
            'nesw-resize',
            { top: -5, right: -5, transformOrigin: 'top right' },
            startResize('tr')
          )}
          {handle(
            'nesw-resize',
            { bottom: -5, left: -5, transformOrigin: 'bottom left' },
            startResize('bl')
          )}
          {handle(
            'nwse-resize',
            { bottom: -5, right: -5, transformOrigin: 'bottom right' },
            startResize('br')
          )}
        </>
      )}
    </div>
  );
}
