import { unwrapEnvelope, getResumeIdFromUpload } from '../lib/api/envelope';

describe('API envelope helpers', () => {
  it('unwrapEnvelope returns data when present', () => {
    const input = { data: { a: 1 } };
    expect(unwrapEnvelope(input)).toEqual({ a: 1 });
  });

  it('unwrapEnvelope returns object when no data wrapper', () => {
    const input = { a: 1 };
    expect(unwrapEnvelope(input)).toEqual({ a: 1 });
  });

  it('getResumeIdFromUpload reads nested resume_id', () => {
    const input = { data: { resume_id: 'abc-123' } };
    expect(getResumeIdFromUpload(input)).toBe('abc-123');
  });

  it('getResumeIdFromUpload reads legacy top-level resume_id', () => {
    const input = { resume_id: 'xyz-789' };
    expect(getResumeIdFromUpload(input)).toBe('xyz-789');
  });

  it('getResumeIdFromUpload returns undefined for invalid shapes', () => {
    const input = { data: { resume_id: 42 } } as any;
    expect(getResumeIdFromUpload(input)).toBeUndefined();
  });
});
