// Keyword parsing, diffing and ATS scoring utilities extracted from page components.
// Pure functions to enable reuse & unit testing.

export interface KeywordDiffResult {
  present: string[];
  missing: string[];
  extra: string[];
}

export interface AtsScoreResult {
  keywordCoverage: number; // 0-100
  sectionCompleteness: number; // 0-100 heuristic
  finalScore: number; // 0-100 int
}

/** Normalize potentially messy keyword payloads coming from backend / AI layer. */
export type RawKeywords = unknown;

export function parseKeywords(raw: RawKeywords): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { extracted_keywords?: unknown }).extracted_keywords)) {
        return (parsed as { extracted_keywords: unknown[] }).extracted_keywords.map(String).filter(Boolean);
      }
    } catch {
      if (raw.includes(',') || raw.includes('\n') || raw.includes(';')) {
        return raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
      }
      return [raw];
    }
    return [];
  }
  if (typeof raw === 'object') {
    const maybe = (raw as { extracted_keywords?: unknown }).extracted_keywords;
    if (Array.isArray(maybe)) return maybe.map(String).filter(Boolean);
  }
  return [];
}

/** Compute present / missing / extra sets (case-insensitive comparison). */
export function diffKeywords(resumeKeywords: string[], jobKeywords: string[]): KeywordDiffResult {
  const rk = new Set(resumeKeywords.map(k => k.toLowerCase()));
  const jk = new Set(jobKeywords.map(k => k.toLowerCase()));
  const present: string[] = [];
  const missing: string[] = [];
  const extra: string[] = [];
  jk.forEach(k => { if (rk.has(k)) present.push(k); else missing.push(k); });
  rk.forEach(k => { if (!jk.has(k)) extra.push(k); });
  return { present, missing, extra };
}

/** ATS heuristic: 70% keyword coverage + 30% section completeness. */
export function computeAtsScore(diff: KeywordDiffResult, jobKeywords: string[], sectionCompleteness: number): AtsScoreResult {
  const keywordCoverage = jobKeywords.length ? (diff.present.length / jobKeywords.length) * 100 : 0;
  const finalScore = Math.round(0.7 * keywordCoverage + 0.3 * sectionCompleteness);
  return { keywordCoverage, sectionCompleteness, finalScore };
}
