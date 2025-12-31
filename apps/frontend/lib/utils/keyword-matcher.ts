/**
 * Keyword extraction and matching utilities for JD-Resume comparison.
 */

// Common English stop words to filter out
const STOP_WORDS = new Set([
  // Articles
  'a', 'an', 'the',
  // Pronouns
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
  'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers',
  'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  // Verbs (common)
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'having', 'do', 'does', 'did', 'doing', 'will', 'would', 'could', 'should', 'might',
  'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'will',
  // Prepositions
  'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while',
  'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in',
  'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
  // Conjunctions
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only',
  // Common words
  'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'etc', 'within',
  // Job posting common words (not meaningful keywords)
  'role', 'position', 'job', 'work', 'working', 'team', 'company', 'looking',
  'seeking', 'required', 'requirements', 'responsibilities', 'qualifications',
  'preferred', 'experience', 'years', 'year', 'ability', 'skills', 'knowledge',
  'strong', 'excellent', 'good', 'great', 'well', 'include', 'including', 'includes',
  'must', 'may', 'like', 'etc', 'e.g', 'i.e', 'such', 'via',
]);

// Minimum word length to consider as keyword
const MIN_WORD_LENGTH = 3;

/**
 * Extract significant keywords from text.
 * Filters out stop words, short words, and normalizes to lowercase.
 */
export function extractKeywords(text: string): Set<string> {
  const keywords = new Set<string>();

  // Split by non-word characters (keeps alphanumeric and hyphens)
  const words = text.toLowerCase().split(/[^a-z0-9-]+/);

  for (const word of words) {
    // Skip short words, stop words, and pure numbers
    if (
      word.length >= MIN_WORD_LENGTH &&
      !STOP_WORDS.has(word) &&
      !/^\d+$/.test(word)
    ) {
      keywords.add(word);
    }
  }

  return keywords;
}

/**
 * Check if a word matches any keyword (case-insensitive).
 */
export function matchesKeyword(word: string, keywords: Set<string>): boolean {
  return keywords.has(word.toLowerCase());
}

/**
 * Split text into segments, marking which segments are keyword matches.
 * Returns an array of { text, isMatch } objects for rendering.
 */
export function segmentTextByKeywords(
  text: string,
  keywords: Set<string>
): Array<{ text: string; isMatch: boolean }> {
  const segments: Array<{ text: string; isMatch: boolean }> = [];

  // Split into word and non-word segments while preserving the original text
  // Use the same character set as extractKeywords: letters, digits, and hyphens
  const parts = text.split(/([^a-zA-Z0-9-]+)/);

  for (const part of parts) {
    if (!part) continue;

    // Check if this part is a word (not just whitespace/punctuation)
    // Must match the same character set as extractKeywords
    const isWord = /^[a-zA-Z0-9-]+$/.test(part);

    if (isWord) {
      const cleanWord = part.toLowerCase().replace(/^-+|-+$/g, '');
      const isMatch = keywords.has(cleanWord);
      segments.push({ text: part, isMatch });
    } else {
      // Whitespace or punctuation - not a match
      segments.push({ text: part, isMatch: false });
    }
  }

  return segments;
}

/**
 * Calculate match statistics between resume text and JD keywords.
 */
export function calculateMatchStats(
  resumeText: string,
  jdKeywords: Set<string>
): { matchedKeywords: Set<string>; matchCount: number; totalKeywords: number; matchPercentage: number } {
  const resumeKeywords = extractKeywords(resumeText);
  const matchedKeywords = new Set<string>();

  for (const keyword of jdKeywords) {
    if (resumeKeywords.has(keyword)) {
      matchedKeywords.add(keyword);
    }
  }

  const matchCount = matchedKeywords.size;
  const totalKeywords = jdKeywords.size;
  const matchPercentage = totalKeywords > 0 ? Math.round((matchCount / totalKeywords) * 100) : 0;

  return { matchedKeywords, matchCount, totalKeywords, matchPercentage };
}
