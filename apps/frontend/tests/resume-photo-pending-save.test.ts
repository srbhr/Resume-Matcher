import { describe, expect, it, vi } from 'vitest';
import { savePendingResumeBeforePhoto } from '@/lib/utils/resume-photo-pending-save';

describe('pending resume save before photo mutation', () => {
  it('publishes the persisted resume state before a later photo request fails', async () => {
    const persisted = { personalInfo: { name: 'Persisted' } };
    const onSaved = vi.fn();

    const photoOperation = async () => {
      throw new Error('photo failed');
    };

    await expect(
      savePendingResumeBeforePhoto({
        pendingResume: { personalInfo: { name: 'Draft' } },
        savePendingResume: async () => ({ processed_resume: persisted }),
        onSaved,
        photoOperation,
      })
    ).rejects.toThrow('photo failed');

    expect(onSaved).toHaveBeenCalledOnce();
    expect(onSaved).toHaveBeenCalledWith(persisted);
  });

  it('skips the preliminary save when no resume changes are pending', async () => {
    const savePendingResume = vi.fn();

    await expect(
      savePendingResumeBeforePhoto({
        pendingResume: null,
        savePendingResume,
        onSaved: vi.fn(),
        photoOperation: async () => 'photo saved',
      })
    ).resolves.toBe('photo saved');

    expect(savePendingResume).not.toHaveBeenCalled();
  });
});
