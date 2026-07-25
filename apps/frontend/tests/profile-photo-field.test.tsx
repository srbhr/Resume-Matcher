import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePhotoField } from '@/components/builder/profile-photo-field';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

describe('ProfilePhotoField', () => {
  beforeEach(() => {
    Object.defineProperties(URL, {
      createObjectURL: {
        configurable: true,
        value: vi.fn(() => 'blob:photo'),
      },
      revokeObjectURL: {
        configurable: true,
        value: vi.fn(),
      },
    });
  });

  it('rejects unsupported image formats before opening the editor', async () => {
    render(
      <ProfilePhotoField
        resumeId="resume-1"
        onUpload={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('resume.photo.add', { selector: 'input' }), {
      target: {
        files: [new File(['svg'], 'photo.svg', { type: 'image/svg+xml' })],
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('resume.photo.errors.format');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects files over 8 MB before upload', async () => {
    render(
      <ProfilePhotoField
        resumeId="resume-1"
        onUpload={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    const oversized = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'photo.png', {
      type: 'image/png',
    });

    fireEvent.change(screen.getByLabelText('resume.photo.add', { selector: 'input' }), {
      target: { files: [oversized] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('resume.photo.errors.size');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('disables photo mutations while another resume mutation is running', () => {
    render(
      <ProfilePhotoField
        resumeId="resume-1"
        name="Ada Lovelace"
        photo={{
          cropX: 0,
          cropY: 0,
          cropWidth: 100,
          cropHeight: 100,
          size: 88,
          version: 1,
          aspectRatio: 1,
        }}
        disabled
        onUpload={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'resume.photo.edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'resume.photo.replace' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'resume.photo.remove' })).toBeDisabled();
  });
});
