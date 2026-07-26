import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePhotoEditorDialog } from '@/components/builder/profile-photo-editor-dialog';

const { adaptiveCropBoxProps, translate } = vi.hoisted(() => ({
  adaptiveCropBoxProps: vi.fn(),
  translate: (key: string) => key,
}));

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: translate,
  }),
}));

vi.mock('@/components/builder/adaptive-crop-box', () => ({
  AdaptiveCropBox: (props: {
    onChange: (crop: {
      cropX: number;
      cropY: number;
      cropWidth: number;
      cropHeight: number;
    }) => void;
    disabled?: boolean;
    handleLabels: Record<string, string>;
  }) => {
    adaptiveCropBoxProps(props);
    return (
      <button
        type="button"
        data-testid="cropper"
        disabled={props.disabled}
        onClick={() => props.onChange({ cropX: 25, cropY: 0, cropWidth: 50, cropHeight: 75 })}
      >
        crop
      </button>
    );
  },
}));

describe('ProfilePhotoEditorDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    adaptiveCropBoxProps.mockClear();
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

  it('cannot close or change the crop while an apply is in progress', () => {
    const onOpenChange = vi.fn();
    render(
      <ProfilePhotoEditorDialog
        open
        applying
        sourceUrl="blob:photo"
        onOpenChange={onOpenChange}
        onApply={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('cropper'));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('cropper')).toBeDisabled();
  });

  it('keeps crop handle labels referentially stable across rerenders', () => {
    const props = {
      open: true,
      sourceUrl: 'blob:photo',
      onOpenChange: vi.fn(),
      onApply: vi.fn().mockResolvedValue(undefined),
    };
    const { rerender } = render(<ProfilePhotoEditorDialog {...props} />);
    const firstLabels = adaptiveCropBoxProps.mock.calls.at(-1)?.[0].handleLabels;

    rerender(<ProfilePhotoEditorDialog {...props} error="retry" />);
    const secondLabels = adaptiveCropBoxProps.mock.calls.at(-1)?.[0].handleLabels;

    expect(secondLabels).toBe(firstLabels);
  });
});
