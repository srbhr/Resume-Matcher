import { describe, expect, it } from 'vitest';
import { hasMeaningfulResumeContent } from '@/lib/utils/resume-content';

/**
 * Guards the frontend half of a predicate that is mirrored from
 * `apps/backend/app/services/parser.py::has_meaningful_resume_content`.
 * The dashboard downgrades a `ready` resume with no meaningful content to
 * `failed`, so a false positive here means users get a blank PDF instead of a
 * retry prompt.
 */

/** Wrap `leaf` in `depth` nested objects: nest(2, 'x') -> { a: { a: 'x' } }. */
function nest(depth: number, leaf: unknown): unknown {
  let value = leaf;
  for (let i = 0; i < depth; i += 1) {
    value = { a: value };
  }
  return value;
}

describe('hasMeaningfulResumeContent', () => {
  it('rejects non-object input', () => {
    expect(hasMeaningfulResumeContent(null)).toBe(false);
    expect(hasMeaningfulResumeContent(undefined)).toBe(false);
    expect(hasMeaningfulResumeContent('resume')).toBe(false);
    expect(hasMeaningfulResumeContent(42)).toBe(false);
    // A top-level array is not a ResumeData object even when it holds text.
    expect(hasMeaningfulResumeContent([{ summary: 'Senior engineer' }])).toBe(false);
  });

  it('rejects the empty object an LLM can return and still validate', () => {
    expect(hasMeaningfulResumeContent({})).toBe(false);
  });

  it('rejects schema defaults: empty strings, empty lists, whitespace', () => {
    expect(
      hasMeaningfulResumeContent({
        personalInfo: { name: '', email: '', phone: '   ' },
        summary: '',
        workExperience: [],
        education: [],
        personalProjects: [],
        additional: {},
        customSections: {},
      })
    ).toBe(false);
  });

  it('rejects entries whose only populated keys are structural', () => {
    expect(
      hasMeaningfulResumeContent({
        workExperience: [
          { id: 'exp-1', order: 0, isVisible: true, company: '', title: '', description: '' },
        ],
      })
    ).toBe(false);
    expect(
      hasMeaningfulResumeContent({
        education: [{ id: 'edu-1', key: 'education', displayName: 'Education', isDefault: true }],
      })
    ).toBe(false);
  });

  it('accepts a populated personalInfo', () => {
    expect(
      hasMeaningfulResumeContent({
        personalInfo: { id: 'p-1', name: 'Ada Lovelace', email: '', phone: '' },
        summary: '',
        workExperience: [],
      })
    ).toBe(true);
  });

  it('accepts content nested inside additional', () => {
    expect(
      hasMeaningfulResumeContent({
        personalInfo: {},
        additional: { skills: [{ id: 's-1', name: 'TypeScript' }] },
      })
    ).toBe(true);
  });

  it('accepts a customSections entry keyed by a structural-looking identifier', () => {
    // customSections identifiers are dict keys, not schema fields, so
    // structural-key filtering is deliberately disabled one level down.
    expect(
      hasMeaningfulResumeContent({ customSections: { id: { heading: 'Certifications' } } })
    ).toBe(true);
    // The same shape under a normal section stays filtered -- this pair is the
    // whole point of the `section !== 'customSections'` argument.
    expect(hasMeaningfulResumeContent({ additional: { id: { heading: 'Certifications' } } })).toBe(
      false
    );
  });

  it('resumes structural filtering inside a custom section', () => {
    expect(hasMeaningfulResumeContent({ customSections: { certs: { id: 'cs-1' } } })).toBe(false);
    expect(hasMeaningfulResumeContent({ customSections: { certs: { heading: 'AWS' } } })).toBe(
      true
    );
  });

  it('only inspects the seven content sections', () => {
    expect(
      hasMeaningfulResumeContent({
        sectionMeta: [{ displayName: 'Skills', heading: 'Skills' }],
        templateSettings: { fontFamily: 'Geist' },
      })
    ).toBe(false);
  });

  it('stops recursing past 10 levels', () => {
    // Depth 9 is still reachable; depth 10 hits the recursion guard.
    expect(hasMeaningfulResumeContent({ additional: nest(9, 'Reachable') })).toBe(true);
    expect(hasMeaningfulResumeContent({ additional: nest(10, 'Too deep') })).toBe(false);
    expect(hasMeaningfulResumeContent({ additional: nest(25, 'Way too deep') })).toBe(false);
  });
});
