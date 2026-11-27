import React from 'react';
import dynamic from 'next/dynamic';
// The default template ships with the page, so it server-renders and paints at once.
import { ResumeSingleColumn } from '@/components/resume/resume-single-column';
import {
  type TemplateSettings,
  type TemplateType,
  DEFAULT_TEMPLATE_SETTINGS,
  settingsToCssVars,
} from '@/lib/types/template-settings';
import baseStyles from '@/components/resume/styles/_base.module.css';
// The Serif, Sans and Mono faces (lib/types/template-settings.ts), one file per weight
// the templates use. The preview renders in the reader's browser and the PDF in the
// server's Chromium, which have different local fonts, so both load these files to
// wrap lines and break pages the same way. Static on purpose: Chromium writes variable
// fonts into PDFs as Type 3 fonts, which space letters unevenly ("RESUM EN") in the
// page and in the extracted text an ATS reads. next/font/google only serves these
// families as variable fonts.
import '@fontsource/noto-sans/300.css';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-sans/800.css';
import '@fontsource/noto-sans/400-italic.css';
import '@fontsource/noto-sans/700-italic.css';
import '@fontsource/noto-serif/300.css';
import '@fontsource/noto-serif/400.css';
import '@fontsource/noto-serif/600.css';
import '@fontsource/noto-serif/700.css';
import '@fontsource/noto-serif/800.css';
import '@fontsource/noto-serif/400-italic.css';
import '@fontsource/noto-serif/700-italic.css';
import '@fontsource/noto-sans-mono/300.css';
import '@fontsource/noto-sans-mono/400.css';
import '@fontsource/noto-sans-mono/600.css';
import '@fontsource/noto-sans-mono/700.css';
import '@fontsource/noto-sans-mono/800.css';

// The other templates load when a resume uses them: all ten were in the
// first-load JS of /builder and /resumes/[id]. The preview re-measures pages when
// one arrives (usePagination observes the measured copy). Print pages render on
// the server, where next/dynamic doesn't split server code.
/**
 * If a template's code fails to load in the browser (a tab left open across an
 * upgrade, a dropped connection), the resume shows in the single-column template
 * instead of the page failing. On the server, which renders the print page for
 * the PDF, the error is thrown: a PDF in the wrong template would be worse than
 * a failed download, which says so.
 */
function orSingleColumn<P>(load: Promise<React.ComponentType<P>>, template: string) {
  return load.catch((error: unknown): React.ComponentType<P> => {
    if (typeof window === 'undefined') throw error;
    console.error(`The ${template} template failed to load; showing Single column.`, error);
    return ResumeSingleColumn as unknown as React.ComponentType<P>;
  });
}

const ResumeTwoColumn = dynamic(() =>
  orSingleColumn(
    import('@/components/resume/resume-two-column').then((m) => m.ResumeTwoColumn),
    'Two column'
  )
);
const ResumeModern = dynamic(() =>
  orSingleColumn(
    import('@/components/resume/resume-modern').then((m) => m.ResumeModern),
    'Modern'
  )
);
const ResumeModernTwoColumn = dynamic(() =>
  orSingleColumn(
    import('@/components/resume/resume-modern-two-column').then((m) => m.ResumeModernTwoColumn),
    'Modern two column'
  )
);
const ResumeLatex = dynamic(() =>
  orSingleColumn(
    import('@/components/resume/resume-latex').then((m) => m.ResumeLatex),
    'LaTeX'
  )
);
const ResumeClean = dynamic(() =>
  orSingleColumn(
    import('@/components/resume/resume-clean').then((m) => m.ResumeClean),
    'Clean'
  )
);
const ResumeVivid = dynamic(() =>
  orSingleColumn(
    import('@/components/resume/resume-vivid').then((m) => m.ResumeVivid),
    'Vivid'
  )
);
const ResumeVividSingle = dynamic(() =>
  orSingleColumn(
    import('@/components/resume/resume-vivid-single').then((m) => m.ResumeVividSingle),
    'Vivid single'
  )
);
const ResumeModernDeedy = dynamic(() =>
  orSingleColumn(
    import('@/components/resume/resume-modern-deedy').then((m) => m.ResumeModernDeedy),
    'Modern Deedy'
  )
);
const ResumeDeedy = dynamic(() =>
  orSingleColumn(
    import('@/components/resume/resume-deedy').then((m) => m.ResumeDeedy),
    'Deedy'
  )
);

export interface PersonalInfo {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
}

export interface Experience {
  condensed?: boolean;
  id: number;
  title?: string;
  company?: string;
  location?: string;
  years?: string;
  description?: string[];
  descriptionStyles?: ('bullet' | 'plain')[];
}

export interface Education {
  id: number;
  institution?: string;
  degree?: string;
  years?: string;
  description?: string;
}

export interface Project {
  id: number;
  name?: string;
  role?: string;
  years?: string;
  github?: string;
  website?: string;
  description?: string[];
  descriptionStyles?: ('bullet' | 'plain')[];
}

export interface AdditionalInfo {
  technicalSkills?: string[];
  languages?: string[];
  certificationsTraining?: string[];
  awards?: string[];
}

export interface AdditionalSectionLabels {
  technicalSkills: string;
  languages: string;
  certifications: string;
  awards: string;
}

export interface ResumeSectionHeadings {
  summary: string;
  experience: string;
  education: string;
  projects: string;
  certifications: string;
  skills: string;
  languages: string;
  awards: string;
  links: string;
  earlierExperience?: string;
}

export interface ResumeFallbackLabels {
  name: string;
}

// Section Type for dynamic sections
export type SectionType = 'personalInfo' | 'text' | 'itemList' | 'stringList';

// Section Metadata for dynamic section management
export interface SectionMeta {
  id: string; // Unique identifier (e.g., "summary", "custom_1")
  key: string; // Data key (matches ResumeData field or customSections key)
  displayName: string; // User-visible name
  sectionType: SectionType; // Type of section
  isDefault: boolean; // True for built-in sections
  isVisible: boolean; // Whether to show in resume
  order: number; // Display order (0 = first after personalInfo)
}

// Generic item for custom item-based sections
export interface CustomSectionItem {
  id: number;
  title?: string; // Primary title
  subtitle?: string; // Secondary info (company, institution, etc.)
  location?: string;
  years?: string;
  description?: string[];
  descriptionStyles?: ('bullet' | 'plain')[];
}

// Custom section data container
export interface CustomSection {
  sectionType: SectionType;
  items?: CustomSectionItem[]; // For itemList type
  strings?: string[]; // For stringList type
  text?: string; // For text type
}

export interface ResumeData {
  personalInfo?: PersonalInfo;
  summary?: string;
  workExperience?: Experience[];
  education?: Education[];
  personalProjects?: Project[];
  additional?: AdditionalInfo;
  // NEW: Section metadata and custom sections
  sectionMeta?: SectionMeta[];
  customSections?: Record<string, CustomSection>;
}

interface ResumeProps {
  resumeData: ResumeData;
  template?: TemplateType;
  settings?: TemplateSettings;
  additionalSectionLabels?: Partial<AdditionalSectionLabels>;
  sectionHeadings?: Partial<ResumeSectionHeadings>;
  fallbackLabels?: Partial<ResumeFallbackLabels>;
  /**
   * Content locale ("zh" | "ja" | "ko" | ...). Orders the CJK font fallback
   * stack so a shared codepoint resolves to the right regional face.
   */
  locale?: string;
  /** A photo CV's photo (a data URL): every template shows it top right. */
  photo?: string | null;
}

/**
 * Resume Component
 *
 * Main wrapper component that delegates rendering to template-specific components.
 * Applies CSS custom properties from settings for consistent styling.
 *
 * Templates:
 * - swiss-single: Traditional single-column layout (default)
 * - swiss-two-column: Two-column layout with experience sidebar
 * - modern: Single-column with user-selectable accent colors
 * - modern-two-column: Two-column layout with modern colorful accents
 */
const Resume: React.FC<ResumeProps> = ({
  resumeData,
  template = 'swiss-single',
  settings,
  additionalSectionLabels,
  sectionHeadings,
  fallbackLabels,
  locale,
  photo,
}) => {
  // Merge provided settings with defaults
  const mergedSettings: TemplateSettings = {
    ...DEFAULT_TEMPLATE_SETTINGS,
    ...settings,
    margins: { ...DEFAULT_TEMPLATE_SETTINGS.margins, ...settings?.margins },
    spacing: { ...DEFAULT_TEMPLATE_SETTINGS.spacing, ...settings?.spacing },
    fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, ...settings?.fontSize },
    listStyle: { ...DEFAULT_TEMPLATE_SETTINGS.listStyle, ...settings?.listStyle },
  };

  // If template is provided as prop but not in settings, use the prop
  if (template && !settings?.template) {
    mergedSettings.template = template;
  }

  // Convert settings to CSS variables
  const cssVars = settingsToCssVars(mergedSettings, locale);

  return (
    <div
      className={`${baseStyles['resume-body']} bg-white text-black w-full mx-auto resume-template-${mergedSettings.template}`}
      style={cssVars}
      // Read by _base.module.css: how project links and each list row print.
      data-link-style={mergedSettings.linkStyle}
      data-list-skills={mergedSettings.listStyle.skills}
      data-list-languages={mergedSettings.listStyle.languages}
      data-list-certifications={mergedSettings.listStyle.certifications}
      data-list-awards={mergedSettings.listStyle.awards}
    >
      {mergedSettings.template === 'swiss-single' && (
        <ResumeSingleColumn
          earlierExperienceLabel={sectionHeadings?.earlierExperience}
          data={resumeData}
          photo={photo}
          showContactIcons={mergedSettings.showContactIcons}
          additionalSectionLabels={additionalSectionLabels}
        />
      )}
      {mergedSettings.template === 'swiss-two-column' && (
        <ResumeTwoColumn
          earlierExperienceLabel={sectionHeadings?.earlierExperience}
          data={resumeData}
          photo={photo}
          showContactIcons={mergedSettings.showContactIcons}
          sectionHeadings={sectionHeadings}
        />
      )}
      {mergedSettings.template === 'modern' && (
        <ResumeModern
          earlierExperienceLabel={sectionHeadings?.earlierExperience}
          data={resumeData}
          photo={photo}
          showContactIcons={mergedSettings.showContactIcons}
          additionalSectionLabels={additionalSectionLabels}
        />
      )}
      {mergedSettings.template === 'modern-two-column' && (
        <ResumeModernTwoColumn
          earlierExperienceLabel={sectionHeadings?.earlierExperience}
          data={resumeData}
          photo={photo}
          showContactIcons={mergedSettings.showContactIcons}
          sectionHeadings={sectionHeadings}
          fallbackLabels={fallbackLabels}
        />
      )}
      {mergedSettings.template === 'latex' && (
        <ResumeLatex
          earlierExperienceLabel={sectionHeadings?.earlierExperience}
          data={resumeData}
          photo={photo}
          showContactIcons={mergedSettings.showContactIcons}
          additionalSectionLabels={additionalSectionLabels}
        />
      )}
      {mergedSettings.template === 'clean' && (
        <ResumeClean
          earlierExperienceLabel={sectionHeadings?.earlierExperience}
          data={resumeData}
          photo={photo}
          showContactIcons={mergedSettings.showContactIcons}
          additionalSectionLabels={additionalSectionLabels}
        />
      )}
      {mergedSettings.template === 'vivid' && (
        <ResumeVivid
          earlierExperienceLabel={sectionHeadings?.earlierExperience}
          data={resumeData}
          photo={photo}
          showContactIcons={mergedSettings.showContactIcons}
          sectionHeadings={sectionHeadings}
          fallbackLabels={fallbackLabels}
        />
      )}
      {mergedSettings.template === 'vivid-single' && (
        <ResumeVividSingle
          earlierExperienceLabel={sectionHeadings?.earlierExperience}
          data={resumeData}
          photo={photo}
          showContactIcons={mergedSettings.showContactIcons}
          sectionHeadings={sectionHeadings}
          fallbackLabels={fallbackLabels}
        />
      )}
      {mergedSettings.template === 'modern-deedy' && (
        <ResumeModernDeedy
          earlierExperienceLabel={sectionHeadings?.earlierExperience}
          data={resumeData}
          photo={photo}
          showContactIcons={mergedSettings.showContactIcons}
          additionalSectionLabels={additionalSectionLabels}
        />
      )}
      {mergedSettings.template === 'deedy' && (
        <ResumeDeedy
          earlierExperienceLabel={sectionHeadings?.earlierExperience}
          data={resumeData}
          photo={photo}
          sectionHeadings={sectionHeadings}
          additionalSectionLabels={additionalSectionLabels}
          fallbackLabels={fallbackLabels}
        />
      )}
    </div>
  );
};

export default Resume;
