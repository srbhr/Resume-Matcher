/**
 * Mirror of `apps/backend/app/services/parser.py::has_meaningful_resume_content`
 * (and its `_has_meaningful_resume_value` helper), which is the authoritative
 * implementation. The backend rejects an LLM parse whose result carries no
 * user-visible content; the dashboard uses the same predicate to surface a
 * legacy `ready` resume that stored `{}` as `failed` instead of a blank PDF.
 *
 * THE TWO COPIES MUST BE CHANGED TOGETHER. The constant names, values and the
 * seven section names below are kept aligned with the Python so the two files
 * can be diffed by eye:
 *
 *   nonContentResumeKeys      <-> _NON_CONTENT_RESUME_KEYS
 *   maxResumeContentRecursion <-> _MAX_RESUME_CONTENT_RECURSION
 *   hasMeaningfulResumeValue  <-> _has_meaningful_resume_value
 *   hasMeaningfulResumeContent<-> has_meaningful_resume_content
 */

/** @internal Exported for tests/resume-content-parity.test.ts. */
export const nonContentResumeKeys = new Set([
  'id',
  'sectionType',
  'descriptionStyles',
  'isDefault',
  'isVisible',
  'order',
  'key',
  'displayName',
]);

/** @internal Exported for tests/resume-content-parity.test.ts. */
export const maxResumeContentRecursion = 10;

/**
 * Content-bearing sections, mirroring ``content_sections`` in the Python.
 * @internal Exported for tests/resume-content-parity.test.ts.
 */
export const resumeContentSections = [
  'personalInfo',
  'summary',
  'workExperience',
  'education',
  'personalProjects',
  'additional',
  'customSections',
] as const;

/**
 * Return whether a value contains non-structural, user-visible text.
 *
 * Custom-section identifiers are dictionary keys rather than schema fields, so
 * their values are checked without filtering the identifier itself. Once inside
 * a section, normal structural-key filtering resumes.
 */
const hasMeaningfulResumeValue = (
  value: unknown,
  depth = 0,
  filterStructuralKeys = true
): boolean => {
  if (depth >= maxResumeContentRecursion) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulResumeValue(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, item]) =>
      (!filterStructuralKeys || !nonContentResumeKeys.has(key)) &&
      hasMeaningfulResumeValue(item, depth + 1)
  );
};

/**
 * Return whether parsed resume data contains any user-facing content.
 *
 * `ResumeData` intentionally defaults most fields to empty strings/lists. That
 * is useful for the builder, but it also means an LLM response such as `{}`
 * validates successfully — which would render a blank resume.
 */
export const hasMeaningfulResumeContent = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const resume = value as Record<string, unknown>;
  return resumeContentSections.some((section) =>
    hasMeaningfulResumeValue(resume[section], 0, section !== 'customSections')
  );
};
