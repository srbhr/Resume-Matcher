import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compareCounts,
  countHits,
  formatRatchetReport,
  loadAllowlist,
  scanTree,
} from '../scripts/swiss-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Swiss guard ratchet', () => {
  it('matches tests/swiss-guard.allowlist.json exactly (no new drift, no stale entries)', () => {
    const byFile = scanTree(ROOT);
    const report = formatRatchetReport(
      compareCounts(countHits(byFile), loadAllowlist(ROOT)),
      byFile
    );
    expect(report).toBe('');
  });
});
