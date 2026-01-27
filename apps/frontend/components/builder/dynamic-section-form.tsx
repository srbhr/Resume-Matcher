'use client';

import React from 'react';
import type {
  ResumeData,
  SectionMeta,
  CustomSection,
  PersonalInfo,
} from '@/components/dashboard/resume-component';
import { SectionHeader } from './section-header';
import { PersonalInfoForm } from './forms/personal-info-form';
import { SummaryForm } from './forms/summary-form';
import { ExperienceForm } from './forms/experience-form';
import { EducationForm } from './forms/education-form';
import { ProjectsForm } from './forms/projects-form';
import { AdditionalForm } from './forms/additional-form';
import { GenericTextForm } from './forms/generic-text-form';
import { GenericItemForm } from './forms/generic-item-form';
import { GenericListForm } from './forms/generic-list-form';
import { useTranslations } from '@/lib/i18n';

interface DynamicSectionFormProps {
  sectionMeta: SectionMeta;
  resumeData: ResumeData;
  onUpdate: (data: ResumeData) => void;
  onSectionMetaUpdate: (sections: SectionMeta[]) => void;
  allSections: SectionMeta[];
  isFirst: boolean;
  isLast: boolean;
}

/**
 * DynamicSectionForm Component
 *
 * Factory component that renders the appropriate form based on section type.
 * Wraps each form with SectionHeader for management controls.
 *
 * For default sections, uses the existing specialized form components.
 * For custom sections, uses generic form components based on section type.
 */
export const DynamicSectionForm: React.FC<DynamicSectionFormProps> = ({
  sectionMeta,
  resumeData,
  onUpdate,
  onSectionMetaUpdate,
  allSections,
  isFirst,
  isLast,
}) => {
  const { t } = useTranslations();
  // Handle section rename
  const handleRename = (newName: string) => {
    const updatedSections = allSections.map((s) =>
      s.id === sectionMeta.id ? { ...s, displayName: newName } : s
    );
    onSectionMetaUpdate(updatedSections);
  };

  // Handle section delete
  const handleDelete = () => {
    if (sectionMeta.isDefault) {
      // For default sections, just hide them
      handleToggleVisibility();
    } else {
      // For custom sections, remove from both sectionMeta and customSections
      const updatedSections = allSections.filter((s) => s.id !== sectionMeta.id);
      const updatedCustomSections = { ...resumeData.customSections };
      delete updatedCustomSections[sectionMeta.key];

      onUpdate({
        ...resumeData,
        customSections: updatedCustomSections,
      });
      onSectionMetaUpdate(updatedSections);
    }
  };

  // Handle move up
  const handleMoveUp = () => {
    const sorted = [...allSections].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((s) => s.id === sectionMeta.id);
    if (index <= 0 || sorted[index - 1].id === 'personalInfo') return;

    const current = sorted[index];
    const above = sorted[index - 1];
    const updatedSections = allSections.map((s) => {
      if (s.id === current.id) return { ...s, order: above.order };
      if (s.id === above.id) return { ...s, order: current.order };
      return s;
    });
    onSectionMetaUpdate(updatedSections);
  };

  // Handle move down
  const handleMoveDown = () => {
    const sorted = [...allSections].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((s) => s.id === sectionMeta.id);
    if (index < 0 || index >= sorted.length - 1) return;

    const current = sorted[index];
    const below = sorted[index + 1];
    const updatedSections = allSections.map((s) => {
      if (s.id === current.id) return { ...s, order: below.order };
      if (s.id === below.id) return { ...s, order: current.order };
      return s;
    });
    onSectionMetaUpdate(updatedSections);
  };

  // Handle visibility toggle
  const handleToggleVisibility = () => {
    const updatedSections = allSections.map((s) =>
      s.id === sectionMeta.id ? { ...s, isVisible: !s.isVisible } : s
    );
    onSectionMetaUpdate(updatedSections);
  };

  // Render form content based on section type and whether it's default or custom
  const renderFormContent = () => {
    // For default sections, use specialized form components
    if (sectionMeta.isDefault) {
      switch (sectionMeta.key) {
        case 'personalInfo':
          return (
            <PersonalInfoForm
              data={resumeData.personalInfo || ({} as PersonalInfo)}
              onChange={(data) => onUpdate({ ...resumeData, personalInfo: data })}
            />
          );

        case 'summary':
          return (
            <SummaryForm
              value={resumeData.summary || ''}
              onChange={(value) => onUpdate({ ...resumeData, summary: value })}
            />
          );

        case 'workExperience':
          return (
            <ExperienceForm
              data={resumeData.workExperience || []}
              onChange={(data) => onUpdate({ ...resumeData, workExperience: data })}
            />
          );

        case 'education':
          return (
            <EducationForm
              data={resumeData.education || []}
              onChange={(data) => onUpdate({ ...resumeData, education: data })}
            />
          );

        case 'personalProjects':
          return (
            <ProjectsForm
              data={resumeData.personalProjects || []}
              onChange={(data) => onUpdate({ ...resumeData, personalProjects: data })}
            />
          );

        case 'additional':
          return (
            <AdditionalForm
              data={
                resumeData.additional || {
                  technicalSkills: [],
                  languages: [],
                  certificationsTraining: [],
                  awards: [],
                }
              }
              onChange={(data) => onUpdate({ ...resumeData, additional: data })}
            />
          );

        default:
          return (
            <div className="text-gray-500">
              {t('builder.customSections.unknownDefaultSection', { section: sectionMeta.key })}
            </div>
          );
      }
    }

    // For custom sections, use generic form components
    const customSection = resumeData.customSections?.[sectionMeta.key];

    const updateCustomSection = (updates: Partial<CustomSection>) => {
      onUpdate({
        ...resumeData,
        customSections: {
          ...resumeData.customSections,
          [sectionMeta.key]: {
            ...customSection,
            sectionType: sectionMeta.sectionType,
            ...updates,
          } as CustomSection,
        },
      });
    };

    switch (sectionMeta.sectionType) {
      case 'text':
        return (
          <GenericTextForm
            value={customSection?.text || ''}
            onChange={(value) => updateCustomSection({ text: value })}
            label={t('builder.customSections.contentLabel')}
            placeholder={t('builder.customSections.contentPlaceholder', {
              name: sectionMeta.displayName,
            })}
          />
        );

      case 'itemList':
        return (
          <GenericItemForm
            items={customSection?.items || []}
            onChange={(items) => updateCustomSection({ items })}
            itemLabel={t('builder.customSections.entryLabel')}
            addLabel={t('builder.customSections.addEntryLabel')}
          />
        );

      case 'stringList':
        return (
          <GenericListForm
            items={customSection?.strings || []}
            onChange={(strings) => updateCustomSection({ strings })}
            label={t('builder.customSections.itemsLabel')}
            placeholder={t('builder.customSections.itemsPlaceholder')}
          />
        );

      default:
        return (
          <div className="text-gray-500">
            {t('builder.customSections.unknownSectionType', { type: sectionMeta.sectionType })}
          </div>
        );
    }
  };

  // For default sections that have their own wrapper styling (like PersonalInfoForm),
  // we render them directly. For custom sections and some default sections,
  // we wrap them with our SectionHeader.
  const needsWrapper =
    !sectionMeta.isDefault ||
    ![
      'personalInfo',
      'summary',
      'workExperience',
      'education',
      'personalProjects',
      'additional',
    ].includes(sectionMeta.key);

  // personalInfo is special - can't be deleted/hidden/reordered
  const isPersonalInfo = sectionMeta.id === 'personalInfo';

  if (needsWrapper) {
    return (
      <div className="space-y-6 border border-black p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
        <SectionHeader
          section={sectionMeta}
          onRename={handleRename}
          onDelete={handleDelete}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onToggleVisibility={handleToggleVisibility}
          isFirst={isFirst || isPersonalInfo}
          isLast={isLast}
          canDelete={!isPersonalInfo}
        >
          {renderFormContent()}
        </SectionHeader>
      </div>
    );
  }

  // For default sections with existing styling, render directly
  // but add management controls via overlay or pass props
  return renderFormContent();
};
