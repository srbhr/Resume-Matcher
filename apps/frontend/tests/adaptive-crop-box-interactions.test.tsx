import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AdaptiveCropBox,
  type CropHandle,
  type CropRect,
} from '@/components/builder/adaptive-crop-box';

const handleLabels = Object.fromEntries(
  ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map((handle) => [handle, `resize-${handle}`])
) as Record<CropHandle, string>;

describe('AdaptiveCropBox keyboard interaction', () => {
  const crop: CropRect = { cropX: 20, cropY: 20, cropWidth: 40, cropHeight: 40 };

  it('moves the crop with arrow keys', () => {
    const onChange = vi.fn();
    render(
      <AdaptiveCropBox
        imageUrl="blob:photo"
        value={crop}
        onChange={onChange}
        moveLabel="move-crop"
        handleLabels={handleLabels}
      />
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'move-crop' }), {
      key: 'ArrowRight',
    });

    expect(onChange).toHaveBeenCalledWith({ ...crop, cropX: 21 });
  });

  it('resizes an edge with arrow keys', () => {
    const onChange = vi.fn();
    render(
      <AdaptiveCropBox
        imageUrl="blob:photo"
        value={crop}
        onChange={onChange}
        moveLabel="move-crop"
        handleLabels={handleLabels}
      />
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'resize-e' }), {
      key: 'ArrowRight',
    });

    expect(onChange).toHaveBeenCalledWith({ ...crop, cropWidth: 41 });
  });
});
