import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePhotoEditorDialog } from '@/components/builder/profile-photo-editor-dialog';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/builder/adaptive-crop-box', () => ({
  AdaptiveCropBox: ({
    onChange,
  }: {
    onChange: (crop: {
      cropX: number;
      cropY: number;
      cropWidth: number;
      cropHeight: number;
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="cropper"
      onClick={() => onChange({ cropX: 25, cropY: 0, cropWidth: 50, cropHeight: 75 })}
    >
      crop
    </button>
  ),
}));

describe('ProfilePhotoEditorDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses fade-only dialog motion and applies the adaptive crop', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);

    render(
      <ProfilePhotoEditorDialog
        open
        sourceUrl="blob:photo"
        onOpenChange={vi.fn()}
        onApply={onApply}
      />
    );

    expect(screen.getByRole('dialog')).not.toHaveClass('zoom-in-95');
    fireEvent.click(screen.getByTestId('cropper'));
    fireEvent.change(screen.getByLabelText('resume.photo.size'), {
      target: { value: '96' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.apply' }));

    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith({
        cropX: 25,
        cropY: 0,
        cropWidth: 50,
        cropHeight: 75,
        size: 96,
      })
    );
  });

  it('resets to the complete image and default display size', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <ProfilePhotoEditorDialog
        open
        sourceUrl="blob:photo"
        initialSettings={{
          cropX: 25,
          cropY: 0,
          cropWidth: 50,
          cropHeight: 75,
          size: 110,
          version: 1,
          aspectRatio: 1,
        }}
        onOpenChange={vi.fn()}
        onApply={onApply}
      />
    );

    fireEvent.click(screen.getByTestId('cropper'));
    fireEvent.click(screen.getByRole('button', { name: 'resume.photo.reset' }));

    expect(screen.getByLabelText('resume.photo.size')).toHaveValue('88');
    expect(screen.getByRole('button', { name: 'common.apply' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'common.apply' }));
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith({
        cropX: 0,
        cropY: 0,
        cropWidth: 100,
        cropHeight: 100,
        size: 88,
      })
    );
  });
});
