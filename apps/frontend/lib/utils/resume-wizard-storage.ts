import type {
  CustomSection,
  CustomSectionItem,
  Education,
  Experience,
  Project,
  ResumeData,
  SectionMeta,
  SectionType,
} from '@/components/dashboard/resume-component';
import {
  createInitialResumeWizardState,
  type ResumeWizardHistoryEntry,
  type ResumeWizardSection,
  type ResumeWizardState,
  type ResumeWizardStep,
} from '@/lib/api/resume-wizard';

export const RESUME_WIZARD_DRAFT_STORAGE_KEY = 'resume_wizard_draft';
export const RESUME_WIZARD_DRAFT_SCHEMA_VERSION = 1;

const MAX_QUESTIONS = 15;
const SECTIONS: ResumeWizardSection[] = [
  'intro',
  'contact',
  'summary',
  'workExperience',
  'internships',
  'education',
  'personalProjects',
  'skills',
  'review',
];
const STEPS: ResumeWizardStep[] = ['intro', 'question', 'review', 'complete'];
const SECTION_TYPES: SectionType[] = ['personalInfo', 'text', 'itemList', 'stringList'];

interface ResumeWizardDraftEnvelope {
  schemaVersion: typeof RESUME_WIZARD_DRAFT_SCHEMA_VERSION;
  state: ResumeWizardState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function descriptionRows(
  value: unknown,
  styles: unknown
): { description: string[]; descriptionStyles: ('plain' | 'bullet')[] } {
  const rows = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  const rawStyles = Array.isArray(styles) ? styles : [];
  const paired = rows.flatMap((row, index) =>
    typeof row === 'string' && row.trim()
      ? [
          {
            text: row.trim(),
            style: rawStyles[index] === 'plain' ? ('plain' as const) : ('bullet' as const),
          },
        ]
      : []
  );
  return {
    description: paired.map((row) => row.text),
    descriptionStyles: paired.map((row) => row.style),
  };
}

function yearsValue(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : stringValue(value);
}

function integerInRange(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function normalizeExperience(value: unknown, index: number): Experience | null {
  if (!isRecord(value)) return null;
  const descriptions = descriptionRows(value.description, value.descriptionStyles);
  return {
    id: index + 1,
    title: stringValue(value.title),
    company: stringValue(value.company),
    location: optionalString(value.location),
    years: yearsValue(value.years),
    ...descriptions,
  };
}

function normalizeEducation(value: unknown, index: number): Education | null {
  if (!isRecord(value)) return null;
  return {
    id: index + 1,
    institution: stringValue(value.institution),
    degree: stringValue(value.degree),
    years: yearsValue(value.years),
    description: optionalString(value.description),
  };
}

function normalizeProject(value: unknown, index: number): Project | null {
  if (!isRecord(value)) return null;
  const descriptions = descriptionRows(value.description, value.descriptionStyles);
  return {
    id: index + 1,
    name: stringValue(value.name),
    role: stringValue(value.role),
    years: yearsValue(value.years),
    github: optionalString(value.github),
    website: optionalString(value.website),
    ...descriptions,
  };
}

function normalizeCustomItem(value: unknown, index: number): CustomSectionItem | null {
  if (!isRecord(value)) return null;
  const descriptions = descriptionRows(value.description, value.descriptionStyles);
  return {
    id: index + 1,
    title: optionalString(value.title),
    subtitle: optionalString(value.subtitle),
    location: optionalString(value.location),
    years: yearsValue(value.years) || undefined,
    ...descriptions,
  };
}

function normalizeSectionMeta(value: unknown): SectionMeta[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !SECTION_TYPES.includes(entry.sectionType as SectionType)) return [];
    if (
      typeof entry.id !== 'string' ||
      typeof entry.key !== 'string' ||
      typeof entry.displayName !== 'string'
    ) {
      return [];
    }
    return [
      {
        id: entry.id,
        key: entry.key,
        displayName: entry.displayName,
        sectionType: entry.sectionType as SectionType,
        isDefault: entry.isDefault === true,
        isVisible: entry.isVisible !== false,
        order: integerInRange(entry.order, 0, 0, Number.MAX_SAFE_INTEGER),
      },
    ];
  });
}

function normalizeCustomSections(value: unknown): Record<string, CustomSection> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, section]) => {
      if (!isRecord(section) || !SECTION_TYPES.includes(section.sectionType as SectionType))
        return [];
      const sectionType = section.sectionType as SectionType;
      return [
        [
          key,
          {
            sectionType,
            text: optionalString(section.text),
            strings: stringList(section.strings),
            items: Array.isArray(section.items)
              ? section.items
                  .map(normalizeCustomItem)
                  .filter((item): item is CustomSectionItem => item !== null)
              : [],
          },
        ],
      ];
    })
  );
}

function normalizeResumeData(value: unknown, fallback: ResumeData): ResumeData {
  if (!isRecord(value)) return fallback;
  const personalInfo = isRecord(value.personalInfo) ? value.personalInfo : {};
  const additional = isRecord(value.additional) ? value.additional : {};
  return {
    personalInfo: {
      name: stringValue(personalInfo.name),
      title: stringValue(personalInfo.title),
      email: stringValue(personalInfo.email),
      phone: stringValue(personalInfo.phone),
      location: stringValue(personalInfo.location),
      website: stringValue(personalInfo.website),
      linkedin: stringValue(personalInfo.linkedin),
      github: stringValue(personalInfo.github),
    },
    summary: stringValue(value.summary, fallback.summary),
    workExperience: Array.isArray(value.workExperience)
      ? value.workExperience
          .map(normalizeExperience)
          .filter((item): item is Experience => item !== null)
      : [],
    education: Array.isArray(value.education)
      ? value.education.map(normalizeEducation).filter((item): item is Education => item !== null)
      : [],
    personalProjects: Array.isArray(value.personalProjects)
      ? value.personalProjects
          .map(normalizeProject)
          .filter((item): item is Project => item !== null)
      : [],
    additional: {
      technicalSkills: stringList(additional.technicalSkills),
      languages: stringList(additional.languages),
      certificationsTraining: stringList(additional.certificationsTraining),
      awards: stringList(additional.awards),
    },
    sectionMeta: normalizeSectionMeta(value.sectionMeta),
    customSections: normalizeCustomSections(value.customSections),
  };
}

function normalizeHistory(value: unknown, fallbackResume: ResumeData): ResumeWizardHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    if (
      typeof entry.question !== 'string' ||
      typeof entry.answer !== 'string' ||
      !SECTIONS.includes(entry.section as ResumeWizardSection) ||
      !isRecord(entry.resume_data_before)
    ) {
      return [];
    }
    return [
      {
        question: entry.question,
        answer: entry.answer,
        section: entry.section as ResumeWizardSection,
        resume_data_before: normalizeResumeData(entry.resume_data_before, fallbackResume),
      },
    ];
  });
}

function normalizeState(value: unknown): ResumeWizardState | null {
  if (!isRecord(value)) return null;
  const initial = createInitialResumeWizardState();
  // A completed wizard is never persisted by the current writer. Restoring a
  // hand-written/stale complete state would produce a page with no created id
  // and no valid action, so treat it as corrupt instead of trapping the user.
  if (value.step === 'complete') return null;
  const question = isRecord(value.current_question) ? value.current_question : {};
  const section = SECTIONS.includes(question.section as ResumeWizardSection)
    ? (question.section as ResumeWizardSection)
    : initial.current_question.section;
  const resumeData = normalizeResumeData(value.resume_data, initial.resume_data);
  const askedCount = integerInRange(value.asked_count, 0, 0, MAX_QUESTIONS);
  const total = isRecord(value.progress)
    ? integerInRange(value.progress.total, initial.progress.total, 1, MAX_QUESTIONS)
    : initial.progress.total;

  return {
    step: STEPS.includes(value.step as ResumeWizardStep)
      ? (value.step as ResumeWizardStep)
      : initial.step,
    resume_data: resumeData,
    current_question: {
      text:
        typeof question.text === 'string' && question.text.trim()
          ? question.text
          : initial.current_question.text,
      section,
    },
    history: normalizeHistory(value.history, initial.resume_data),
    asked_count: askedCount,
    inferred_skills: stringList(value.inferred_skills),
    is_complete: value.is_complete === true,
    progress: {
      current: isRecord(value.progress)
        ? integerInRange(
            value.progress.current,
            Math.min(askedCount, total),
            0,
            Math.min(askedCount, total)
          )
        : Math.min(askedCount, total),
      total,
    },
    warnings: stringList(value.warnings),
  };
}

export function readResumeWizardDraft(): ResumeWizardState | null {
  try {
    const raw = localStorage.getItem(RESUME_WIZARD_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    if ('schemaVersion' in parsed || 'state' in parsed) {
      if (parsed.schemaVersion !== RESUME_WIZARD_DRAFT_SCHEMA_VERSION) return null;
      return normalizeState(parsed.state);
    }
    return normalizeState(parsed);
  } catch {
    return null;
  }
}

export function writeResumeWizardDraft(state: ResumeWizardState): boolean {
  const envelope: ResumeWizardDraftEnvelope = {
    schemaVersion: RESUME_WIZARD_DRAFT_SCHEMA_VERSION,
    state,
  };
  try {
    localStorage.setItem(RESUME_WIZARD_DRAFT_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function clearResumeWizardDraft(): boolean {
  try {
    localStorage.removeItem(RESUME_WIZARD_DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** A failed remove can leave an already finalized review draft behind. */
export function writeResumeWizardCompletion(resumeId: string): boolean {
  try {
    localStorage.setItem(
      RESUME_WIZARD_DRAFT_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: RESUME_WIZARD_DRAFT_SCHEMA_VERSION,
        completedResumeId: resumeId,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function readResumeWizardCompletion(): string | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(RESUME_WIZARD_DRAFT_STORAGE_KEY) ?? 'null'
    );
    return isRecord(value) &&
      value.schemaVersion === RESUME_WIZARD_DRAFT_SCHEMA_VERSION &&
      typeof value.completedResumeId === 'string' &&
      value.completedResumeId.trim()
      ? value.completedResumeId
      : null;
  } catch {
    return null;
  }
}

/** Retire this acknowledged resume without removing a newer draft or receipt. */
export function clearResumeWizardCompletion(resumeId: string): boolean {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(RESUME_WIZARD_DRAFT_STORAGE_KEY) ?? 'null'
    );
    if (
      isRecord(value) &&
      value.schemaVersion === RESUME_WIZARD_DRAFT_SCHEMA_VERSION &&
      !('state' in value) &&
      value.completedResumeId === resumeId
    ) {
      localStorage.removeItem(RESUME_WIZARD_DRAFT_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}
