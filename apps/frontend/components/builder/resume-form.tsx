'use client';

import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  ResumeData,
  PersonalInfo,
  SectionMeta,
  SectionType,
  CustomSection,
} from '@/components/dashboard/resume-component';
import { PersonalInfoForm } from './forms/personal-info-form';
import { SummaryForm } from './forms/summary-form';
import { ExperienceForm } from './forms/experience-form';
import { EducationForm } from './forms/education-form';
import { ProjectsForm } from './forms/projects-form';
import { AdditionalForm } from './forms/additional-form';
import { SectionHeader } from './section-header';
import { GenericTextForm } from './forms/generic-text-form';
import { GenericItemForm } from './forms/generic-item-form';
import { GenericListForm } from './forms/generic-list-form';
import { AddSectionButton } from './add-section-dialog';
import { DraggableSectionWrapper } from './draggable-section-wrapper';
import {
  getSectionMeta,
  getAllSections,
  createCustomSection,
  DEFAULT_SECTION_META,
} from '@/lib/utils/section-helpers';
import { useTranslations } from '@/lib/i18n';

interface ResumeFormProps {
  resumeData: ResumeData;
  onUpdate: (data: ResumeData) => void;
}

export const ResumeForm: React.FC<ResumeFormProps> = ({ resumeData, onUpdate }) => {
  const { t } = useTranslations();

  // Get section metadata, falling back to defaults
  const allSections = getSectionMeta(resumeData);
  // Use getAllSections for form - shows ALL sections including hidden ones
  // (Hidden sections are editable but marked with visual indicator)
  const sortedAllSections = getAllSections(resumeData);

  // Handle section metadata updates
  const handleSectionMetaUpdate = (sections: SectionMeta[]) => {
    onUpdate({
      ...resumeData,
      sectionMeta: sections,
    });
  };

  // Handle adding a new custom section
  const handleAddSection = (displayName: string, sectionType: SectionType) => {
    const newSection = createCustomSection(allSections, displayName, sectionType);

    // Initialize section metadata if not present
    const currentMeta = resumeData.sectionMeta?.length
      ? resumeData.sectionMeta
      : DEFAULT_SECTION_META;

    // Initialize custom section data
    const newCustomSection: CustomSection = {
      sectionType,
      text: sectionType === 'text' ? '' : undefined,
      items: sectionType === 'itemList' ? [] : undefined,
      strings: sectionType === 'stringList' ? [] : undefined,
    };

    onUpdate({
      ...resumeData,
      sectionMeta: [...currentMeta, newSection],
      customSections: {
        ...resumeData.customSections,
        [newSection.key]: newCustomSection,
      },
    });
  };

  // Handler for section rename
  const handleRename = (sectionId: string, newName: string) => {
    const updatedSections = allSections.map((s) =>
      s.id === sectionId ? { ...s, displayName: newName } : s
    );
    handleSectionMetaUpdate(updatedSections);
  };

  // Handler for section delete
  const handleDelete = (sectionId: string) => {
    const section = allSections.find((s) => s.id === sectionId);
    if (!section) return;

    if (section.isDefault) {
      // For default sections, just hide them
      handleToggleVisibility(sectionId);
    } else {
      // For custom sections, remove from both sectionMeta and customSections
      const updatedSections = allSections.filter((s) => s.id !== sectionId);
      const updatedCustomSections = { ...resumeData.customSections };
      delete updatedCustomSections[section.key];

      onUpdate({
        ...resumeData,
        sectionMeta: updatedSections,
        customSections: updatedCustomSections,
      });
    }
  };

  // Handler for section visibility toggle
  const handleToggleVisibility = (sectionId: string) => {
    const updatedSections = allSections.map((s) =>
      s.id === sectionId ? { ...s, isVisible: !s.isVisible } : s
    );
    handleSectionMetaUpdate(updatedSections);
  };

  // Handler for moving section up
  const handleMoveUp = (sectionId: string) => {
    const sorted = [...allSections].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((s) => s.id === sectionId);
    if (index <= 0 || sorted[index - 1].id === 'personalInfo') return;

    const current = sorted[index];
    const above = sorted[index - 1];
    const updatedSections = allSections.map((s) => {
      if (s.id === current.id) return { ...s, order: above.order };
      if (s.id === above.id) return { ...s, order: current.order };
      return s;
    });
    handleSectionMetaUpdate(updatedSections);
  };

  // Handler for moving section down
  const handleMoveDown = (sectionId: string) => {
    const sorted = [...allSections].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((s) => s.id === sectionId);
    if (index < 0 || index >= sorted.length - 1) return;

    const current = sorted[index];
    const below = sorted[index + 1];
    const updatedSections = allSections.map((s) => {
      if (s.id === current.id) return { ...s, order: below.order };
      if (s.id === below.id) return { ...s, order: current.order };
      return s;
    });
    handleSectionMetaUpdate(updatedSections);
  };

  // Configure drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handler for drag end event
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const sorted = [...allSections].sort((a, b) => a.order - b.order);
    const oldIndex = sorted.findIndex((s) => s.id === active.id);
    const newIndex = sorted.findIndex((s) => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Prevent moving above personalInfo
    if (sorted[newIndex].id === 'personalInfo') return;

    // Create new order by swapping the order values
    const updatedSections = allSections.map((section) => {
      if (section.id === active.id) {
        return { ...section, order: sorted[newIndex].order };
      }
      if (oldIndex < newIndex) {
        // Moving down: shift items up
        if (section.order > sorted[oldIndex].order && section.order <= sorted[newIndex].order) {
          return { ...section, order: section.order - 1 };
        }
      } else {
        // Moving up: shift items down
        if (section.order >= sorted[newIndex].order && section.order < sorted[oldIndex].order) {
          return { ...section, order: section.order + 1 };
        }
      }
      return section;
    });

    handleSectionMetaUpdate(updatedSections);
  };

  // Render default section forms
  const renderDefaultSection = (section: SectionMeta, isFirst: boolean, isLast: boolean) => {
    const isPersonalInfo = section.id === 'personalInfo';

    // Render content based on section key
    const renderContent = () => {
      switch (section.key) {
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
          return null;
      }
    };

    // PersonalInfo is special - render without wrapper
    if (isPersonalInfo) {
      return renderContent();
    }

    // Other default sections get SectionHeader with visibility/reorder controls
    // The form components provide their own container styling
    return (
      <SectionHeader
        section={section}
        onRename={(name) => handleRename(section.id, name)}
        onDelete={() => handleDelete(section.id)}
        onMoveUp={() => handleMoveUp(section.id)}
        onMoveDown={() => handleMoveDown(section.id)}
        onToggleVisibility={() => handleToggleVisibility(section.id)}
        isFirst={isFirst}
        isLast={isLast}
        canDelete={true}
      >
        {renderContent()}
      </SectionHeader>
    );
  };

  // Render custom section forms
  const renderCustomSection = (section: SectionMeta, isFirst: boolean, isLast: boolean) => {
    const customSection = resumeData.customSections?.[section.key];

    const updateCustomSection = (updates: Partial<CustomSection>) => {
      onUpdate({
        ...resumeData,
        customSections: {
          ...resumeData.customSections,
          [section.key]: {
            ...customSection,
            sectionType: section.sectionType,
            ...updates,
          } as CustomSection,
        },
      });
    };

    const renderContent = () => {
      switch (section.sectionType) {
        case 'text':
          return (
            <GenericTextForm
              value={customSection?.text || ''}
              onChange={(value) => updateCustomSection({ text: value })}
              label={t('builder.customSections.contentLabel')}
              placeholder={t('builder.customSections.contentPlaceholder', {
                name: section.displayName,
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
              {t('builder.customSections.unknownSectionType', { type: section.sectionType })}
            </div>
          );
      }
    };

    return (
      <SectionHeader
        section={section}
        onRename={(name) => handleRename(section.id, name)}
        onDelete={() => handleDelete(section.id)}
        onMoveUp={() => handleMoveUp(section.id)}
        onMoveDown={() => handleMoveDown(section.id)}
        onToggleVisibility={() => handleToggleVisibility(section.id)}
        isFirst={isFirst}
        isLast={isLast}
        canDelete={true}
      >
        {renderContent()}
      </SectionHeader>
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={sortedAllSections.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-6 pb-20">
          {sortedAllSections.map((section, index) => {
            const isFirst = index === 0 || section.id === 'personalInfo';
            const isLast = index === sortedAllSections.length - 1;
            const isPersonalInfo = section.id === 'personalInfo';

            const sectionContent = section.isDefault
              ? renderDefaultSection(section, isFirst, isLast)
              : renderCustomSection(section, isFirst, isLast);

            return (
              <DraggableSectionWrapper key={section.id} id={section.id} disabled={isPersonalInfo}>
                {sectionContent}
              </DraggableSectionWrapper>
            );
          })}

          {/* Add Section Button */}
          <AddSectionButton onAdd={handleAddSection} />
        </div>
      </SortableContext>
    </DndContext>
  );
};
