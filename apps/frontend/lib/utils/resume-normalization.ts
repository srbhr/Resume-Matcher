import type {
  CustomSection,
  CustomSectionItem,
  Experience,
  Project,
  ResumeData,
  SectionType,
} from '@/components/dashboard/resume-component';

type DescribedItem = {
  description?: unknown;
  descriptionStyles?: unknown;
};

const isMeaningfulText = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

// Param is `unknown`, not `string[] | undefined`: this runs against persisted
// data that TypeScript never validated, and the narrow type hid that.
const normalizeStringList = (items?: unknown): string[] | undefined => {
  // Only `undefined` means "field absent" — preserve it so the key stays out
  // of the payload. Every other non-array (notably `null` from malformed
  // persisted data) is coerced to []; the old `if (!items) return items`
  // returned null unchanged, leaking it into a value typed `string[] |
  // undefined` and crashing callers that assume an array.
  if (items === undefined) return undefined;
  if (!Array.isArray(items)) return [];
  return items.filter(isMeaningfulText).map((item) => item.trim());
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Exhaustive map keyed on the frontend `SectionType` union (which mirrors the
// backend `SectionType` enum in apps/backend/app/schemas/models.py). A Record
// keyed by SectionType makes TypeScript fail to compile if the union grows and
// this map is not updated — so a new backend section type can never be silently
// dropped from the save payload. CustomSection validation fails on any value
// outside the union, so a persisted entry with a missing or bogus sectionType
// must still be dropped, not passed through.
const CUSTOM_SECTION_TYPES: Readonly<Record<SectionType, true>> = {
  personalInfo: true,
  text: true,
  itemList: true,
  stringList: true,
};

const isCustomSectionRecord = (value: unknown): value is CustomSection =>
  isObjectRecord(value) &&
  typeof value.sectionType === 'string' &&
  CUSTOM_SECTION_TYPES[value.sectionType as SectionType] === true;

const normalizeDescriptionFields = <T extends DescribedItem>(item: T): T => {
  // A null element inside an otherwise-valid array throws on property access.
  // Guarding the container was not enough — persisted arrays can hold nulls.
  if (!isObjectRecord(item)) {
    return item;
  }
  const descriptions = Array.isArray(item.description) ? item.description : [];
  // descriptionStyles is positional — styles[i] belongs to description[i]. It
  // must be filtered in lockstep, or dropping a blank description silently
  // shifts every later point's bullet/plain setting onto its neighbour.
  const styles = Array.isArray(item.descriptionStyles) ? item.descriptionStyles : undefined;
  const nextDescriptions: string[] = [];
  const nextStyles: unknown[] = [];

  descriptions.forEach((description, index) => {
    if (!isMeaningfulText(description)) {
      return;
    }

    nextDescriptions.push(description.trim());
    if (styles) {
      nextStyles.push(styles[index] === 'plain' ? 'plain' : 'bullet');
    }
  });

  return {
    ...item,
    description: nextDescriptions,
    ...(styles ? { descriptionStyles: nextStyles } : {}),
  };
};

// Optional chaining guards null/undefined but NOT a non-string: a numeric
// `title` from malformed persisted data makes `.trim` undefined and throws
// "item.title?.trim is not a function". isMeaningfulText type-checks first.
const hasExperienceContent = (item: Experience): boolean => {
  return Boolean(
    isMeaningfulText(item.title) ||
    isMeaningfulText(item.company) ||
    isMeaningfulText(item.location) ||
    isMeaningfulText(item.years) ||
    (Array.isArray(item.description) && item.description.length)
  );
};

const hasProjectContent = (item: Project): boolean => {
  return Boolean(
    isMeaningfulText(item.name) ||
    isMeaningfulText(item.role) ||
    isMeaningfulText(item.years) ||
    isMeaningfulText(item.github) ||
    isMeaningfulText(item.website) ||
    (Array.isArray(item.description) && item.description.length)
  );
};

const hasCustomItemContent = (item: CustomSectionItem): boolean => {
  return Boolean(
    isMeaningfulText(item.title) ||
    isMeaningfulText(item.subtitle) ||
    isMeaningfulText(item.location) ||
    isMeaningfulText(item.years) ||
    (Array.isArray(item.description) && item.description.length)
  );
};

const normalizeCustomSection = (section: CustomSection): CustomSection => {
  // A persisted customSections entry can be null or a primitive; reading
  // .sectionType off it throws. Guard the section value, not only its items.
  if (!isObjectRecord(section)) {
    return section;
  }

  if (section.sectionType === 'itemList') {
    return {
      ...section,
      // Array.isArray, not `|| []` — a malformed truthy non-array (an object
      // from hand-edited storage) reaches .map and throws.
      items: (Array.isArray(section.items) ? section.items : [])
        .filter(isObjectRecord)
        .map(normalizeDescriptionFields)
        .filter(hasCustomItemContent),
    };
  }

  if (section.sectionType === 'stringList') {
    return {
      ...section,
      strings: normalizeStringList(section.strings),
    };
  }

  return section;
};

export const normalizeResumeForSave = (resume: ResumeData): ResumeData => {
  const customSections = resume.customSections
    ? Object.fromEntries(
        Object.entries(resume.customSections)
          .map(([key, section]) => [key, normalizeCustomSection(section)] as const)
          // normalizeCustomSection returns null/primitive sections unchanged;
          // dropping them here keeps them out of the PATCH payload, where they
          // would fail backend CustomSection validation and crash consumers
          // doing Object.entries(customSections) -> .sectionType. Object-ness
          // alone is not enough — an entry must also carry a sectionType the
          // backend schema actually accepts.
          .filter((entry): entry is readonly [string, CustomSection] =>
            isCustomSectionRecord(entry[1])
          )
      )
    : resume.customSections;

  return {
    ...resume,
    workExperience: (Array.isArray(resume.workExperience) ? resume.workExperience : [])
      .filter(isObjectRecord)
      .map(normalizeDescriptionFields)
      .filter(hasExperienceContent),
    personalProjects: (Array.isArray(resume.personalProjects) ? resume.personalProjects : [])
      .filter(isObjectRecord)
      .map(normalizeDescriptionFields)
      .filter(hasProjectContent),
    // education was the one top-level collection left unguarded, so a null or
    // primitive entry survived normalization and reached the render path.
    // Education.description is a scalar, so there are no styles to align here.
    education: (Array.isArray(resume.education) ? resume.education : []).filter(isObjectRecord),
    additional: resume.additional
      ? {
          ...resume.additional,
          technicalSkills: normalizeStringList(resume.additional.technicalSkills),
          languages: normalizeStringList(resume.additional.languages),
          certificationsTraining: normalizeStringList(resume.additional.certificationsTraining),
          awards: normalizeStringList(resume.additional.awards),
        }
      : resume.additional,
    customSections,
  };
};

export const normalizeResumeForRender = (resume: ResumeData): ResumeData => {
  return normalizeResumeForSave(resume);
};
