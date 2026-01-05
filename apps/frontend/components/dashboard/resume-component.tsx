import React from 'react';
import { ResumeSingleColumn, ResumeTwoColumn } from '@/components/resume';
import {
  type TemplateSettings,
  type TemplateType,
  DEFAULT_TEMPLATE_SETTINGS,
  settingsToCssVars,
} from '@/lib/types/template-settings';
import baseStyles from '@/components/resume/styles/_base.module.css';

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
  id: number;
  title?: string;
  company?: string;
  location?: string;
  years?: string;
  description?: string[];
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
  description?: string[];
}

export interface AdditionalInfo {
  technicalSkills?: string[];
  languages?: string[];
  certificationsTraining?: string[];
  awards?: string[];
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
 */
const Resume: React.FC<ResumeProps> = ({ resumeData, template = 'swiss-single', settings }) => {
  // Merge provided settings with defaults
  const mergedSettings: TemplateSettings = {
    ...DEFAULT_TEMPLATE_SETTINGS,
    ...settings,
    margins: { ...DEFAULT_TEMPLATE_SETTINGS.margins, ...settings?.margins },
    spacing: { ...DEFAULT_TEMPLATE_SETTINGS.spacing, ...settings?.spacing },
    fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, ...settings?.fontSize },
  };

  // If template is provided as prop but not in settings, use the prop
  if (template && !settings?.template) {
    mergedSettings.template = template;
  }

  // Convert settings to CSS variables
  const cssVars = settingsToCssVars(mergedSettings);

  return (
    <div
      className={`resume-body ${baseStyles['resume-body']} bg-white text-black w-full mx-auto resume-template-${mergedSettings.template}`}
      style={cssVars}
    >
      {mergedSettings.template === 'swiss-single' && (
        <ResumeSingleColumn data={resumeData} showContactIcons={mergedSettings.showContactIcons} />
      )}
      {mergedSettings.template === 'swiss-two-column' && (
        <ResumeTwoColumn data={resumeData} showContactIcons={mergedSettings.showContactIcons} />
      )}
    </div>
  );
};

export default Resume;
