import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  maxResumeContentRecursion,
  nonContentResumeKeys,
  resumeContentSections,
} from '@/lib/utils/resume-content';

/**
 * `lib/utils/resume-content.ts` is a hand-maintained TypeScript mirror of
 * `has_meaningful_resume_content` in apps/backend/app/services/parser.py. The
 * backend uses it to reject an empty LLM parse; the dashboard uses it to show
 * a legacy empty-but-`ready` resume as failed. If the two drift, the dashboard
 * starts disagreeing with the backend about whether a resume is usable.
 *
 * A comment asking the next person to keep them in sync is not a guarantee, so
 * this reads the Python source and asserts the shared constants still match —
 * the same tactic as i18n-locale-parity.test.ts.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const parserPy = readFileSync(resolve(repoRoot, 'apps/backend/app/services/parser.py'), 'utf-8');

/** Pull the double-quoted strings out of a named Python block. */
function pyStrings(source: string, pattern: RegExp, label: string): string[] {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `Could not find ${label} in parser.py — the parity guard needs updating, ` +
        'not deleting: it is the only thing keeping the two copies aligned.'
    );
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('resume-content parity with the Python original', () => {
  it('has the same structural (non-content) keys', () => {
    const pythonKeys = pyStrings(
      parserPy,
      /_NON_CONTENT_RESUME_KEYS\s*=\s*frozenset\(\s*\{([\s\S]*?)\}\s*\)/,
      '_NON_CONTENT_RESUME_KEYS'
    );

    expect(pythonKeys.length).toBeGreaterThan(0);
    expect([...nonContentResumeKeys].sort()).toEqual(pythonKeys.sort());
  });

  it('has the same content sections, in the same order', () => {
    const pythonSections = pyStrings(
      parserPy,
      /content_sections\s*=\s*\(([\s\S]*?)\)/,
      'content_sections'
    );

    // Order matters less than membership, but keeping it identical is what
    // lets a reader diff the two files by eye.
    expect([...resumeContentSections]).toEqual(pythonSections);
  });

  it('has the same recursion depth cap', () => {
    const match = parserPy.match(/^_MAX_RESUME_CONTENT_RECURSION\s*=\s*(\d+)/m);
    if (!match) throw new Error('Could not find _MAX_RESUME_CONTENT_RECURSION in parser.py');

    expect(maxResumeContentRecursion).toBe(Number(match[1]));
  });
});
