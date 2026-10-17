/**
 * Keyword extraction and matching utilities for JD-Resume comparison.
 *
 * Matching mirrors the backend (`services/refiner.py`: `_keyword_in_text`,
 * `_extract_all_text`), so JD Match counts a job's saved keywords exactly as the
 * ATS score's keyword match does.
 */

import type { ResumeData } from '@/components/dashboard/resume-component';

// Common English stop words to filter out
const STOP_WORDS = new Set([
  // Articles
  'a',
  'an',
  'the',
  // Pronouns
  'i',
  'me',
  'my',
  'myself',
  'we',
  'our',
  'ours',
  'ourselves',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
  'he',
  'him',
  'his',
  'himself',
  'she',
  'her',
  'hers',
  'herself',
  'it',
  'its',
  'itself',
  'they',
  'them',
  'their',
  'theirs',
  'themselves',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  // Verbs (common)
  'am',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'having',
  'do',
  'does',
  'did',
  'doing',
  'will',
  'would',
  'could',
  'should',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'dare',
  'ought',
  'used',
  // Prepositions
  'a',
  'an',
  'the',
  'and',
  'but',
  'if',
  'or',
  'because',
  'as',
  'until',
  'while',
  'of',
  'at',
  'by',
  'for',
  'with',
  'about',
  'against',
  'between',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'to',
  'from',
  'up',
  'down',
  'in',
  'out',
  'on',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  // Conjunctions
  'and',
  'but',
  'or',
  'nor',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'not',
  'only',
  // Common words
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'also',
  'now',
  'etc',
  'within',
  // Job posting common words (not meaningful keywords)
  'role',
  'position',
  'job',
  'work',
  'working',
  'team',
  'company',
  'looking',
  'seeking',
  'required',
  'requirements',
  'responsibilities',
  'qualifications',
  'preferred',
  'experience',
  'years',
  'year',
  'ability',
  'skills',
  'knowledge',
  'strong',
  'excellent',
  'good',
  'great',
  'well',
  'include',
  'including',
  'includes',
  'must',
  'may',
  'like',
  'etc',
  'e.g',
  'i.e',
  'such',
  'via',
  'join',
  'plus',
  'similar',
  'using',
  'familiarity',
  'familiar',
  'equivalent',
  'bonus',
  'comfort',
  'comfortable',
  'ideal',
  'ideally',
  'candidate',
  'opportunity',
  'environment',
  'inc',
  'ltd',
  'llc',
  'us',
  'and/or',
]);

// Minimum word length to consider as keyword
const MIN_WORD_LENGTH = 3;

// Han, Kana and Hangul: the backend's _CJK_CHAR_CLASS.
const CJK =
  '[\\u1100-\\u11ff\\u3040-\\u30ff\\u3130-\\u318f\\u31f0-\\u31ff\\u3400-\\u9fff\\ua960-\\ua97f' +
  '\\uac00-\\ud7ff\\uf900-\\ufaff\\uff66-\\uffdc\\u{1b000}-\\u{1b16f}\\u{20000}-\\u{3ffff}]';
const CJK_RE = new RegExp(CJK, 'u');
// Python's \w: a Unicode letter, number or underscore. CJK characters also end a
// term, so a Latin skill written next to CJK text still matches.
const WORD = '[\\p{L}\\p{N}_]';
const TERM_START = `(?:(?<!${WORD})|(?<=${CJK}))`;
const TERM_END = `(?:(?!${WORD})|(?=${CJK}))`;

// A term in a posting: letters and digits joined by . - / (Node.js, full-stack,
// CI/CD), with an optional leading dot (.NET) and trailing + or # (C++, C#).
const TERM_RE = /\.?[\p{L}\p{N}]+(?:[.\-/][\p{L}\p{N}]+)*[+#]*/gu;

export type KeywordList = ReadonlySet<string> | readonly string[];

const escapeRegExp = (text: string) => text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

/** Terms in posting order. Slashes split words (Python/Django) but keep short pairs (CI/CD, UI/UX). */
function terms(text: string): string[] {
  return (text.match(TERM_RE) ?? []).flatMap((term) => {
    const parts = term.split('/');
    return parts.length > 1 && parts.some((part) => part.length > 3) ? parts : [term];
  });
}

/**
 * Extract significant keywords from text, for jobs without saved keywords.
 * Filters out stop words, short words, numbers and the `exclude` text (the
 * company name), and normalizes to lowercase. CJK text has no word breaks to
 * split on, so it is left out.
 */
export function extractKeywords(text: string, exclude = ''): Set<string> {
  const excluded = new Set(terms(exclude).map((term) => term.toLowerCase()));
  const keywords = new Set<string>();

  for (const term of terms(text)) {
    const word = term.toLowerCase();
    // Two-letter acronyms (AI, ML, QA) and C# count despite their length.
    const significant =
      word.length >= MIN_WORD_LENGTH || /[+#]/.test(word) || /^\p{Lu}{2}$/u.test(term);
    if (
      significant &&
      !STOP_WORDS.has(word) &&
      !excluded.has(word) &&
      !/^[\p{N}.\-/]+$/u.test(word) &&
      !CJK_RE.test(word)
    ) {
      keywords.add(word);
    }
  }

  return keywords;
}

/** Whether a keyword appears in text: a CJK substring, or a whole term otherwise. */
export function keywordInText(keyword: string, text: string): boolean {
  const term = keyword.trim().toLowerCase();
  if (!term) return false;
  const haystack = text.toLowerCase();
  if (CJK_RE.test(term)) return haystack.includes(term);
  return new RegExp(`${TERM_START}${escapeRegExp(term)}${TERM_END}`, 'u').test(haystack);
}

const patternCache = new WeakMap<KeywordList, RegExp | null>();

/** One regex matching any of the keywords, longest first, with keywordInText's rules. */
function keywordPattern(keywords: KeywordList): RegExp | null {
  const cached = patternCache.get(keywords);
  if (cached !== undefined) return cached;

  const unique = [...new Set([...keywords].map((k) => k.trim().toLowerCase()).filter(Boolean))];
  unique.sort((a, b) => b.length - a.length);
  const cjk = unique.filter((term) => CJK_RE.test(term)).map(escapeRegExp);
  const other = unique.filter((term) => !CJK_RE.test(term)).map(escapeRegExp);
  const alternatives = [
    ...(other.length ? [`${TERM_START}(?:${other.join('|')})${TERM_END}`] : []),
    ...cjk,
  ];
  const pattern = alternatives.length ? new RegExp(alternatives.join('|'), 'giu') : null;
  patternCache.set(keywords, pattern);
  return pattern;
}

/**
 * Split text into segments, marking which segments are keyword matches.
 * Returns an array of { text, isMatch } objects for rendering.
 */
export function segmentTextByKeywords(
  text: string,
  keywords: KeywordList
): Array<{ text: string; isMatch: boolean }> {
  if (!text) return [];
  const pattern = keywordPattern(keywords);
  if (!pattern) return [{ text, isMatch: false }];

  const segments: Array<{ text: string; isMatch: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index), isMatch: false });
    segments.push({ text: match[0], isMatch: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), isMatch: false });

  return segments;
}

/** The resume text the backend scores keyword match on (refiner._extract_all_text). */
export function resumeKeywordText(data: ResumeData): string {
  const parts: string[] = [];

  if (data.summary) parts.push(data.summary);
  for (const exp of data.workExperience ?? []) {
    parts.push(exp.title ?? '', exp.company ?? '', ...(exp.description ?? []));
  }
  for (const edu of data.education ?? []) {
    parts.push(edu.degree ?? '', edu.institution ?? '', edu.description ?? '');
  }
  for (const proj of data.personalProjects ?? []) {
    parts.push(proj.name ?? '', proj.role ?? '', ...(proj.description ?? []));
  }
  const additional = data.additional ?? {};
  parts.push(
    ...(additional.technicalSkills ?? []),
    ...(additional.certificationsTraining ?? []),
    ...(additional.languages ?? []),
    ...(additional.awards ?? [])
  );
  for (const section of Object.values(data.customSections ?? {})) {
    if (section.sectionType === 'itemList') {
      for (const item of section.items ?? []) {
        parts.push(item.title ?? '', item.subtitle ?? '');
        const description: unknown = item.description;
        if (Array.isArray(description)) parts.push(...description);
        else if (typeof description === 'string') parts.push(description);
      }
    } else if (section.sectionType === 'text') {
      parts.push(section.text ?? '');
    } else if (section.sectionType === 'stringList') {
      parts.push(...(section.strings ?? []));
    }
  }

  return parts.filter(Boolean).join(' ');
}

/** Python's round(value, 1): ties go to even, so 6.25 → 6.2 like the stored score. */
function roundToTenth(value: number): number {
  const scaled = value * 10;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const rounded = diff > 0.5 || (diff === 0.5 && floor % 2 !== 0) ? floor + 1 : floor;
  return rounded / 10;
}

/**
 * Calculate match statistics between resume text and JD keywords.
 * matchPercentage is rounded to one decimal, as the ATS score's keyword match is.
 */
export function calculateMatchStats(
  resumeText: string,
  jdKeywords: KeywordList
): {
  matchedKeywords: Set<string>;
  matchCount: number;
  totalKeywords: number;
  matchPercentage: number;
} {
  const keywords = [...jdKeywords];
  const matched = keywords.filter((keyword) => keywordInText(keyword, resumeText));

  const matchCount = matched.length;
  const totalKeywords = keywords.length;
  const matchPercentage = totalKeywords > 0 ? roundToTenth((matchCount / totalKeywords) * 100) : 0;

  return { matchedKeywords: new Set(matched), matchCount, totalKeywords, matchPercentage };
}
