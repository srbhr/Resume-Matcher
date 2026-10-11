import { safeStorage } from '@/lib/utils/resume-draft-storage';
import type { PageFitSettings } from '@/lib/api/resume';

/** Max pages the tailored resume is fitted to; null = no page fitting. */
export type TailorPageLimit = 1 | 2 | 3 | null;
/** Max bullets kept per job/project before fitting; null = keep all. */
export type TailorBulletCap = 3 | 5 | null;

export interface TailorLengthSettings {
  maxPages: TailorPageLimit;
  maxBulletsPerEntry: TailorBulletCap;
}

export const TAILOR_PAGE_LIMITS: readonly TailorPageLimit[] = [1, 2, 3, null];
export const TAILOR_BULLET_CAPS: readonly TailorBulletCap[] = [3, 5, null];

export const DEFAULT_TAILOR_LENGTH: TailorLengthSettings = {
  maxPages: 2,
  maxBulletsPerEntry: null,
};

export const TAILOR_LENGTH_STORAGE_KEY = 'tailor_length_settings';

function pick<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Saved tailor length choice, falling back to defaults field by field. */
export function readTailorLength(): TailorLengthSettings {
  try {
    const saved = safeStorage.get(TAILOR_LENGTH_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Record<keyof TailorLengthSettings, unknown>>;
      return {
        maxPages: pick(TAILOR_PAGE_LIMITS, parsed.maxPages, DEFAULT_TAILOR_LENGTH.maxPages),
        maxBulletsPerEntry: pick(
          TAILOR_BULLET_CAPS,
          parsed.maxBulletsPerEntry,
          DEFAULT_TAILOR_LENGTH.maxBulletsPerEntry
        ),
      };
    }
  } catch {
    // fall through to defaults
  }
  return DEFAULT_TAILOR_LENGTH;
}

export function writeTailorLength(settings: TailorLengthSettings): void {
  safeStorage.set(TAILOR_LENGTH_STORAGE_KEY, JSON.stringify(settings));
}

/** Preview request options for a length choice; an off limit sends nothing for it. */
export function buildPreviewLengthOptions(
  length: TailorLengthSettings,
  pageFit: PageFitSettings
): { maxBulletsPerEntry?: number; pageFit?: PageFitSettings; maxPages?: number } {
  return {
    ...(length.maxBulletsPerEntry !== null
      ? { maxBulletsPerEntry: length.maxBulletsPerEntry }
      : {}),
    ...(length.maxPages !== null ? { pageFit, maxPages: length.maxPages } : {}),
  };
}
