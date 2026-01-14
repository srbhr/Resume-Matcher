/**
 * Section helpers for dynamic resume section management.
 *
 * These utilities handle section metadata operations including
 * getting default sections, sorting, and managing custom sections.
 */

import type { ResumeData, SectionMeta, SectionType } from '@/components/dashboard/resume-component';

export type TranslationFunction = (key: string, params?: Record<string, string | number>) => string;

/**
 * Default section metadata for backward compatibility.
 * Used when a resume doesn't have sectionMeta defined.
 */
export const DEFAULT_SECTION_META: SectionMeta[] = [
  {
    id: 'personalInfo',
    key: 'personalInfo',
    displayName: 'Personal Info',
    sectionType: 'personalInfo',
    isDefault: true,
    isVisible: true,
    order: 0,
  },
  {
    id: 'summary',
    key: 'summary',
    displayName: 'Summary',
    sectionType: 'text',
    isDefault: true,
    isVisible: true,
    order: 1,
  },
  {
    id: 'workExperience',
    key: 'workExperience',
    displayName: 'Experience',
    sectionType: 'itemList',
    isDefault: true,
    isVisible: true,
    order: 2,
  },
  {
    id: 'education',
    key: 'education',
    displayName: 'Education',
    sectionType: 'itemList',
    isDefault: true,
    isVisible: true,
    order: 3,
  },
  {
    id: 'personalProjects',
    key: 'personalProjects',
    displayName: 'Projects',
    sectionType: 'itemList',
    isDefault: true,
    isVisible: true,
    order: 4,
  },
  {
    id: 'additional',
    key: 'additional',
    displayName: 'Skills & Awards',
    sectionType: 'stringList',
    isDefault: true,
    isVisible: true,
    order: 5,
  },
];

const DEFAULT_SECTION_DISPLAY_NAME_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(DEFAULT_SECTION_META.map((section) => [section.id, section.displayName]))
);

const DEFAULT_SECTION_I18N_KEY_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  personalInfo: 'resume.sections.personalInfo',
  summary: 'resume.sections.summary',
  workExperience: 'resume.sections.experience',
  education: 'resume.sections.education',
  personalProjects: 'resume.sections.projects',
  additional: 'resume.sections.skills',
});

/**
 * Localize default section display names without overwriting user customizations.
 *
 * Rules:
 * - Only affects built-in sections (isDefault === true)
 * - Only overwrites when the displayName still equals the original English default
 */
export function localizeDefaultSectionMeta(
  sections: SectionMeta[],
  t: TranslationFunction
): SectionMeta[] {
  return sections.map((section) => {
    if (!section.isDefault) return section;

    const i18nKey = DEFAULT_SECTION_I18N_KEY_BY_ID[section.id];
    if (!i18nKey) return section;

    const defaultDisplayName = DEFAULT_SECTION_DISPLAY_NAME_BY_ID[section.id];
    if (!defaultDisplayName) return section;

    if (section.displayName !== defaultDisplayName) return section;

    return { ...section, displayName: t(i18nKey) };
  });
}

/**
 * Return a ResumeData object with localized default sectionMeta.
 *
 * - If resumeData.sectionMeta is missing, it generates it from DEFAULT_SECTION_META.
 * - If sectionMeta exists, it only localizes untouched default English section names.
 */
export function withLocalizedDefaultSections(
  resumeData: ResumeData,
  t: TranslationFunction
): ResumeData {
  const baseMeta = resumeData.sectionMeta?.length ? resumeData.sectionMeta : DEFAULT_SECTION_META;
  const localizedMeta = localizeDefaultSectionMeta(baseMeta, t);
  return { ...resumeData, sectionMeta: localizedMeta };
}

/**
 * Get section metadata from resume data, falling back to defaults.
 */
export function getSectionMeta(resumeData: ResumeData): SectionMeta[] {
  return resumeData.sectionMeta?.length ? resumeData.sectionMeta : DEFAULT_SECTION_META;
}

/**
 * Get sorted sections (visible only) for rendering.
 */
export function getSortedSections(resumeData: ResumeData): SectionMeta[] {
  return [...getSectionMeta(resumeData)]
    .filter((s) => s.isVisible)
    .sort((a, b) => a.order - b.order);
}

/**
 * Get all sections (including hidden) for management UI.
 */
export function getAllSections(resumeData: ResumeData): SectionMeta[] {
  return [...getSectionMeta(resumeData)].sort((a, b) => a.order - b.order);
}

/**
 * Generate a unique ID for a new custom section.
 */
export function generateCustomSectionId(existingSections: SectionMeta[]): string {
  const customSections = existingSections.filter((s) => s.id.startsWith('custom_'));
  const maxId = customSections.reduce((max, s) => {
    const num = parseInt(s.id.replace('custom_', ''), 10);
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  return `custom_${maxId + 1}`;
}

/**
 * Create a new custom section with metadata.
 */
export function createCustomSection(
  existingSections: SectionMeta[],
  displayName: string,
  sectionType: SectionType
): SectionMeta {
  const id = generateCustomSectionId(existingSections);
  const maxOrder = Math.max(...existingSections.map((s) => s.order), 0);

  return {
    id,
    key: id,
    displayName,
    sectionType,
    isDefault: false,
    isVisible: true,
    order: maxOrder + 1,
  };
}

/**
 * Update section display name.
 */
export function updateSectionName(
  sections: SectionMeta[],
  sectionId: string,
  newName: string
): SectionMeta[] {
  return sections.map((s) => (s.id === sectionId ? { ...s, displayName: newName } : s));
}

/**
 * Toggle section visibility.
 */
export function toggleSectionVisibility(sections: SectionMeta[], sectionId: string): SectionMeta[] {
  return sections.map((s) => (s.id === sectionId ? { ...s, isVisible: !s.isVisible } : s));
}

/**
 * Delete a section (only non-default sections can be fully deleted).
 * For default sections, this just hides them.
 */
export function deleteSection(sections: SectionMeta[], sectionId: string): SectionMeta[] {
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return sections;

  // personalInfo cannot be deleted or hidden
  if (section.id === 'personalInfo') return sections;

  // Default sections just get hidden
  if (section.isDefault) {
    return toggleSectionVisibility(sections, sectionId);
  }

  // Custom sections can be fully deleted
  const filtered = sections.filter((s) => s.id !== sectionId);

  // Reorder remaining sections
  return filtered.map((s, index) => ({
    ...s,
    order: s.id === 'personalInfo' ? 0 : index,
  }));
}

/**
 * Move a section up in order (decrease order number).
 */
export function moveSectionUp(sections: SectionMeta[], sectionId: string): SectionMeta[] {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((s) => s.id === sectionId);

  // Can't move first section or personalInfo
  if (index <= 0 || sorted[index].id === 'personalInfo') return sections;

  // Can't move above personalInfo
  if (sorted[index - 1].id === 'personalInfo') return sections;

  // Swap orders
  const current = sorted[index];
  const above = sorted[index - 1];

  return sections.map((s) => {
    if (s.id === current.id) return { ...s, order: above.order };
    if (s.id === above.id) return { ...s, order: current.order };
    return s;
  });
}

/**
 * Move a section down in order (increase order number).
 */
export function moveSectionDown(sections: SectionMeta[], sectionId: string): SectionMeta[] {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((s) => s.id === sectionId);

  // Can't move last section or personalInfo
  if (index < 0 || index >= sorted.length - 1) return sections;
  if (sorted[index].id === 'personalInfo') return sections;

  // Swap orders
  const current = sorted[index];
  const below = sorted[index + 1];

  return sections.map((s) => {
    if (s.id === current.id) return { ...s, order: below.order };
    if (s.id === below.id) return { ...s, order: current.order };
    return s;
  });
}

/**
 * Normalize section orders to be contiguous starting from 0.
 */
export function normalizeOrders(sections: SectionMeta[]): SectionMeta[] {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  return sorted.map((s, index) => ({ ...s, order: index }));
}

/**
 * Get section type display label.
 */
export function getSectionTypeLabel(sectionType: SectionType): string {
  switch (sectionType) {
    case 'personalInfo':
      return 'Personal Info';
    case 'text':
      return 'Text Block';
    case 'itemList':
      return 'Item List';
    case 'stringList':
      return 'Skill List';
    default:
      return 'Unknown';
  }
}
