import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The crop dialog's own behaviour, with ui-sdk's cropper stood in for: jsdom can
 * neither decode an image nor crop one, so the stand-in reports a crop at once.
 */
const crop = vi.hoisted(() => ({ cropImage: vi.fn() }));
vi.mock('@ui-sdk/react/image', () => ({ cropImage: crop.cropImage }));
vi.mock('@ui-sdk/react/image-cropper', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ImageCropper: ({
      onCropChange,
      children,
    }: {
      onCropChange: (crop: object) => void;
      children: ReactNode;
    }) => {
      useEffect(() => onCropChange({ x: 0, y: 0, width: 35, height: 45 }), [onCropChange]);
      return <div>{children}</div>;
    },
    ImageCropperViewport: Pass,
    ImageCropperSelection: Pass,
    ImageCropperGrid: () => null,
    ImageCropperImage: (props: { alt: string; onError?: () => void }) => (
      // oxlint-disable-next-line next/no-img-element -- stands in for ui-sdk's cropper image
      <img alt={props.alt} src="blob:photo" data-testid="crop-image" onError={props.onError} />
    ),
    ImageCropperZoom: () => null,
    ImageCropperRotate: Pass,
  };
});

import { PhotoCropDialog } from '@/components/ui/photo-crop-dialog';

const labels = {
  title: 'Crop photo',
  hint: 'Drag to frame',
  imageAlt: 'Your photo',
  zoom: 'Zoom',
  rotate: 'Rotate',
  apply: 'Use photo',
  cancel: 'Cancel',
  failed: 'Could not crop this photo.',
};

const file = new File(['jpeg bytes'], 'me.jpg', { type: 'image/jpeg' });

function renderDialog() {
  const onCancel = vi.fn();
  const onCropped = vi.fn();
  render(
    <PhotoCropDialog
      file={file}
      aspectRatio={35 / 45}
      outputWidth={600}
      labels={labels}
      onCancel={onCancel}
      onCropped={onCropped}
    />
  );
  return { onCancel, onCropped };
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:photo') }));
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  crop.cropImage.mockReset();
  vi.unstubAllGlobals();
});

describe('PhotoCropDialog', () => {
  it('hands back the cropped photo as a JPEG', async () => {
    crop.cropImage.mockResolvedValue(new Blob(['cropped'], { type: 'image/jpeg' }));
    const { onCropped } = renderDialog();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Use photo' })));

    expect(onCropped).toHaveBeenCalledTimes(1);
    expect(onCropped.mock.lastCall?.[0]).toMatchObject({ name: 'me.jpg', type: 'image/jpeg' });
  });

  it('says so when the crop fails, and stays open with Use photo enabled again', async () => {
    crop.cropImage.mockRejectedValue(new Error('canvas failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { onCropped, onCancel } = renderDialog();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Use photo' })));

    expect(screen.getByRole('alert')).toHaveTextContent(labels.failed);
    expect(screen.getByRole('button', { name: 'Use photo' })).toBeEnabled();
    expect(onCropped).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('says so when the photo cannot be read', () => {
    renderDialog();
    fireEvent.error(screen.getByTestId('crop-image'));
    expect(screen.getByRole('alert')).toHaveTextContent(labels.failed);
  });

  it('drops a crop that finishes after Cancel', async () => {
    let finish: (blob: Blob) => void = () => {};
    crop.cropImage.mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      })
    );
    const { onCropped, onCancel } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Use photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await act(async () => finish(new Blob(['late'], { type: 'image/jpeg' })));
    expect(onCropped).not.toHaveBeenCalled();
  });

  it('frees the photo’s object URL when it closes', () => {
    const { unmount } = render(
      <PhotoCropDialog
        file={file}
        aspectRatio={35 / 45}
        outputWidth={600}
        labels={labels}
        onCancel={vi.fn()}
        onCropped={vi.fn()}
      />
    );
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });
});
