import { describe, expect, it } from 'vitest';
import {
  calculateMatchStats,
  extractKeywords,
  segmentTextByKeywords,
} from '@/lib/utils/keyword-matcher';

/**
 * Pure JD↔resume keyword logic that drives the match highlighting / stats in
 * the tailor view. Deterministic, no DOM.
 */

describe('extractKeywords', () => {
  it('lowercases and keeps significant words', () => {
    const kw = extractKeywords('Senior Python Engineer with FastAPI');
    expect(kw.has('python')).toBe(true);
    expect(kw.has('fastapi')).toBe(true);
    expect(kw.has('engineer')).toBe(true);
  });

  it('drops stop words (incl. job-posting filler) and short words', () => {
    const kw = extractKeywords('the and with of go ai');
    expect(kw.has('the')).toBe(false);
    expect(kw.has('with')).toBe(false);
    expect(kw.has('go')).toBe(false); // < 3 chars
    expect(kw.has('ai')).toBe(false); // < 3 chars
  });

  it('drops pure numbers but keeps alphanumerics', () => {
    const kw = extractKeywords('5 years 2024 k8s');
    expect(kw.has('5')).toBe(false);
    expect(kw.has('2024')).toBe(false);
    expect(kw.has('years')).toBe(false); // stop word
    expect(kw.has('k8s')).toBe(true); // alphanumeric kept
  });

  it('deduplicates via a Set', () => {
    const kw = extractKeywords('Docker docker DOCKER');
    expect([...kw]).toEqual(['docker']);
  });

  it('returns an empty set when everything is filtered', () => {
    expect(extractKeywords('5 years of experience').size).toBe(0);
  });
});

describe('segmentTextByKeywords', () => {
  it('marks only the matching words, preserving original text + spacing', () => {
    const segments = segmentTextByKeywords('Python and Go', new Set(['python']));
    expect(segments.map((s) => s.text).join('')).toBe('Python and Go'); // lossless
    const matched = segments.filter((s) => s.isMatch).map((s) => s.text);
    expect(matched).toEqual(['Python']); // case-insensitive match, original casing kept
  });

  it('matches nothing when there are no keywords', () => {
    const segments = segmentTextByKeywords('Python FastAPI', new Set());
    expect(segments.some((s) => s.isMatch)).toBe(false);
  });
});

describe('calculateMatchStats', () => {
  it('counts matched JD keywords against the resume and rounds the percentage', () => {
    const stats = calculateMatchStats('Python FastAPI Docker', new Set(['python', 'kubernetes']));
    expect(stats.matchCount).toBe(1);
    expect(stats.totalKeywords).toBe(2);
    expect(stats.matchPercentage).toBe(50);
    expect([...stats.matchedKeywords]).toEqual(['python']);
  });

  it('reports 0% (no divide-by-zero) when the JD has no keywords', () => {
    const stats = calculateMatchStats('Python', new Set());
    expect(stats.matchPercentage).toBe(0);
    expect(stats.matchCount).toBe(0);
  });
});
