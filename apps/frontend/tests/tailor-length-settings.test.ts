import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TAILOR_LENGTH,
  TAILOR_LENGTH_STORAGE_KEY,
  buildPreviewLengthOptions,
  readTailorLength,
  writeTailorLength,
} from '@/lib/utils/tailor-length-settings';
import type { PageFitSettings } from '@/lib/api/resume';

const pageFit = { template: 'swiss-single', pageSize: 'A4' } as PageFitSettings;

beforeEach(() => localStorage.clear());

describe('tailor length settings', () => {
  it('defaults to a two-page limit with no bullet cap', () => {
    expect(DEFAULT_TAILOR_LENGTH).toEqual({ maxPages: 2, maxBulletsPerEntry: null });
    expect(readTailorLength()).toEqual(DEFAULT_TAILOR_LENGTH);
  });

  it('round-trips a saved choice, including "no limit"', () => {
    writeTailorLength({ maxPages: null, maxBulletsPerEntry: 5 });
    expect(readTailorLength()).toEqual({ maxPages: null, maxBulletsPerEntry: 5 });
  });

  it.each([
    ['not json', DEFAULT_TAILOR_LENGTH],
    [JSON.stringify({ maxPages: 9, maxBulletsPerEntry: 'lots' }), DEFAULT_TAILOR_LENGTH],
    [JSON.stringify({ maxPages: 3 }), { maxPages: 3, maxBulletsPerEntry: null }],
  ])('falls back per field on bad stored value %s', (raw, expected) => {
    localStorage.setItem(TAILOR_LENGTH_STORAGE_KEY, raw);
    expect(readTailorLength()).toEqual(expected);
  });

  it('sends the page limit with page fit and omits an absent bullet cap', () => {
    expect(buildPreviewLengthOptions({ maxPages: 2, maxBulletsPerEntry: null }, pageFit)).toEqual({
      pageFit,
      maxPages: 2,
    });
  });

  it('sends only the bullet cap when the page limit is off', () => {
    expect(buildPreviewLengthOptions({ maxPages: null, maxBulletsPerEntry: 3 }, pageFit)).toEqual({
      maxBulletsPerEntry: 3,
    });
  });

  it('sends nothing when both limits are off, so nothing is trimmed', () => {
    expect(
      buildPreviewLengthOptions({ maxPages: null, maxBulletsPerEntry: null }, pageFit)
    ).toEqual({});
  });
});
