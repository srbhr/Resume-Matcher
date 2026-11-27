import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));
const api = vi.hoisted(() => ({ uploadResumePhoto: vi.fn() }));
vi.mock('@/lib/api/resume', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/resume')>()),
  uploadResumePhoto: api.uploadResumePhoto,
}));

/**
 * If the crop dialog's code fails to load, a chosen photo is uploaded as it is,
 * the way a browser that can't crop uploads it, rather than the builder failing.
 */
afterEach(() => {
  vi.doUnmock('@/components/ui/photo-crop-dialog');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the photo field when the crop dialog cannot load', () => {
  it('uploads the chosen photo uncropped', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A browser that can crop, so the field asks for the crop dialog.
    vi.stubGlobal('createImageBitmap', vi.fn());
    vi.doMock('@/components/ui/photo-crop-dialog', () => {
      throw new Error('ChunkLoadError');
    });
    vi.resetModules();
    api.uploadResumePhoto.mockResolvedValue('data:image/jpeg;base64,AAAA');
    const { ResumePhotoField } = await import('@/components/builder/forms/resume-photo-field');
    const onChange = vi.fn();
    const { container } = render(
      <ResumePhotoField resumeId="r1" photo={null} onChange={onChange} />
    );

    const file = new File(['jpeg bytes'], 'me.jpg', { type: 'image/jpeg' });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => expect(api.uploadResumePhoto).toHaveBeenCalledWith('r1', file));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA'));
    expect(api.uploadResumePhoto).toHaveBeenCalledTimes(1);
  });
});
