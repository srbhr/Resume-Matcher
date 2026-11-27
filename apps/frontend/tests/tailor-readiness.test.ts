import { describe, expect, it } from 'vitest';
import { tailorBlock } from '@/lib/tailor/readiness';

const ready = {
  busy: false,
  statusLoading: false,
  modelReady: true,
  hasMaster: true,
  hasJob: true,
};

describe('tailorBlock', () => {
  it('lets the job be sent when nothing stands in the way', () => {
    expect(tailorBlock(ready)).toBeNull();
  });

  it.each([
    ['busy', { busy: true }],
    ['statusLoading', { statusLoading: true }],
    ['noModel', { modelReady: false }],
    ['noMaster', { hasMaster: false }],
    ['noJob', { hasJob: false }],
  ] as const)('names %s as the reason', (reason, change) => {
    expect(tailorBlock({ ...ready, ...change })).toBe(reason);
  });

  it('gives the first reason that applies, in the order the page reads them', () => {
    expect(tailorBlock({ ...ready, hasMaster: false, hasJob: false })).toBe('noMaster');
    expect(tailorBlock({ ...ready, modelReady: false, hasJob: false })).toBe('noModel');
    expect(tailorBlock({ ...ready, busy: true, statusLoading: true })).toBe('busy');
  });
});
