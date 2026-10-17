import { describe, expect, it } from 'vitest';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  calculateMatchStats,
  extractKeywords,
  keywordInText,
  resumeKeywordText,
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

describe('extractKeywords on real postings', () => {
  it('keeps technology names that carry symbols whole', () => {
    const kw = extractKeywords('C++, C#, .NET and Node.js with CI/CD and UI/UX.');
    for (const term of ['c++', 'c#', '.net', 'node.js', 'ci/cd', 'ui/ux']) {
      expect(kw.has(term)).toBe(true);
    }
  });

  it('splits slash lists of longer words', () => {
    const kw = extractKeywords('Python/Django or Ruby/Rails');
    expect([...kw]).toEqual(['python', 'django', 'ruby', 'rails']);
  });

  it('keeps two-letter acronyms but not two-letter words', () => {
    const kw = extractKeywords('AI and ML; go do it');
    expect(kw.has('ai')).toBe(true);
    expect(kw.has('ml')).toBe(true);
    expect(kw.has('go')).toBe(false);
  });

  it('drops posting filler and the company name', () => {
    const kw = extractKeywords(
      'Join TechCorp Inc. using Python, plus similar tools',
      'TechCorp Inc.'
    );
    expect([...kw]).toEqual(['python', 'tools']);
  });

  it('keeps accented words whole and leaves CJK out', () => {
    const kw = extractKeywords('Développeur Python, 数据分析');
    expect([...kw]).toEqual(['développeur', 'python']);
  });
});

describe('keywordInText matches the backend refiner', () => {
  // The cases of test_retained_keywords_use_cjk_substrings_and_latin_term_boundaries.
  it('uses CJK substrings and Latin term boundaries', () => {
    const text = '负责数据分析与Pythonによる開発，熟悉Java开发与JavaScript平台';
    for (const keyword of ['数据', 'Python', 'Java', 'JavaScript']) {
      expect(keywordInText(keyword, text)).toBe(true);
    }
    expect(keywordInText('Java', '负责JavaScript平台开发')).toBe(false);
  });

  it('matches phrases and symbols as whole terms, case-insensitively', () => {
    expect(keywordInText('Machine Learning', 'applied machine learning daily')).toBe(true);
    expect(keywordInText('C++', 'Wrote C++ and Rust')).toBe(true);
    expect(keywordInText('Python', 'pythonic code')).toBe(false);
    expect(keywordInText('  ', 'anything')).toBe(false);
  });
});

describe('phrase keywords', () => {
  it('highlights a multi-word keyword as one segment', () => {
    const segments = segmentTextByKeywords('Built machine learning and C++ tools', [
      'machine learning',
      'C++',
    ]);
    expect(segments.filter((s) => s.isMatch).map((s) => s.text)).toEqual([
      'machine learning',
      'C++',
    ]);
    expect(segments.map((s) => s.text).join('')).toBe('Built machine learning and C++ tools');
  });

  it('rounds ties to even like the stored score (1 of 16 is 6.2%)', () => {
    const keywords = Array.from({ length: 16 }, (_, i) => `skill${i}`);
    expect(calculateMatchStats('skill0', keywords).matchPercentage).toBe(6.2);
    expect(calculateMatchStats('skill0 skill1 skill2', keywords).matchPercentage).toBe(18.8);
    expect(calculateMatchStats('skill0', ['skill0', 'a', 'b']).matchPercentage).toBe(33.3);
  });
});

describe('resumeKeywordText', () => {
  it('scans the sections the backend scores, not personal info', () => {
    const text = resumeKeywordText({
      personalInfo: { name: 'Ada', title: 'Kubernetes Lead' },
      summary: 'Summary',
      additional: { technicalSkills: ['Python'], awards: ['Award'] },
      customSections: {
        talks: { sectionType: 'stringList', strings: ['GraphQL talk'] },
        notes: { sectionType: 'text', text: 'Terraform notes' },
      },
    } as unknown as ResumeData);
    expect(text).toBe('Summary Python Award GraphQL talk Terraform notes');
    expect(keywordInText('Kubernetes', text)).toBe(false);
  });
});
