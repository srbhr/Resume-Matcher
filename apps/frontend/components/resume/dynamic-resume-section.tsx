import React from 'react';
import type {
  ResumeData,
  SectionMeta,
  CustomSection,
  CustomSectionItem,
} from '@/components/dashboard/resume-component';
import { formatDateRange } from '@/lib/utils';
import { DescriptionList } from './description-list';
import { RESUME_SECTION, RESUME_SECTION_TITLE, resumeItem } from './page-break-attrs';
import baseStyles from './styles/_base.module.css';

interface DynamicResumeSectionProps {
  sectionMeta: SectionMeta;
  resumeData: ResumeData;
  titleClassName?: string;
  subtitleClassName?: string;
}

/** Whether a custom section has anything to render for its type. */
export function customSectionHasContent(
  sectionType: SectionMeta['sectionType'],
  customSection: CustomSection
): boolean {
  switch (sectionType) {
    case 'text':
      return Boolean(customSection.text?.trim());
    case 'itemList':
      return Boolean(customSection.items?.length);
    case 'stringList':
      return Boolean(customSection.strings?.length);
    default:
      return false;
  }
}

/**
 * DynamicResumeSection Component
 *
 * Renders custom sections in resume templates based on section type.
 * Uses the same CSS classes as built-in sections for consistent styling.
 */
export const DynamicResumeSection: React.FC<DynamicResumeSectionProps> = ({
  sectionMeta,
  resumeData,
  titleClassName = baseStyles['resume-section-title'],
  subtitleClassName = baseStyles['resume-item-subtitle'],
}) => {
  // Get the custom section data
  const customSection = resumeData.customSections?.[sectionMeta.key];

  if (!customSection) return null;

  if (!customSectionHasContent(sectionMeta.sectionType, customSection)) return null;

  return (
    <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
      <h3 {...RESUME_SECTION_TITLE} className={titleClassName}>
        {sectionMeta.displayName}
      </h3>
      {renderContent(sectionMeta.sectionType, customSection, subtitleClassName)}
    </div>
  );
};

/**
 * Render section content based on type
 */
function renderContent(
  sectionType: SectionMeta['sectionType'],
  customSection: CustomSection,
  subtitleClassName: string
) {
  switch (sectionType) {
    case 'text':
      return <TextSectionContent text={customSection.text || ''} />;
    case 'itemList':
      return (
        <ItemListSectionContent
          items={customSection.items || []}
          subtitleClassName={subtitleClassName}
        />
      );
    case 'stringList':
      return <StringListSectionContent strings={customSection.strings || []} />;
    default:
      return null;
  }
}

/**
 * Text Section Content (like Summary)
 */
const TextSectionContent: React.FC<{ text: string }> = ({ text }) => {
  if (!text.trim()) return null;

  return <p className={`text-justify ${baseStyles['resume-text']}`}>{text}</p>;
};

/**
 * Item List Section Content (like Experience)
 */
const ItemListSectionContent: React.FC<{
  items: CustomSectionItem[];
  subtitleClassName: string;
}> = ({ items, subtitleClassName }) => {
  if (items.length === 0) return null;

  return (
    <div className={baseStyles['resume-items']}>
      {items.map((item) => (
        <div key={item.id} {...resumeItem(item.description)} className={baseStyles['resume-item']}>
          {/* Title and Years Row */}
          <div className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}>
            <h4 className={baseStyles['resume-item-title']}>{item.title}</h4>
            {item.years && (
              <span className={`${baseStyles['resume-meta-sm']} shrink-0 ml-4`}>
                {formatDateRange(item.years)}
              </span>
            )}
          </div>

          {/* Subtitle and Location Row */}
          {(item.subtitle || item.location) && (
            <div
              className={`flex justify-between items-center ${baseStyles['resume-row']} ${subtitleClassName}`}
            >
              {item.subtitle && <span>{item.subtitle}</span>}
              {item.location && <span>{item.location}</span>}
            </div>
          )}

          {/* Description Points */}
          <DescriptionList items={item.description} styles={item.descriptionStyles} />
        </div>
      ))}
    </div>
  );
};

/**
 * String List Section Content (like Skills)
 */
const StringListSectionContent: React.FC<{ strings: string[] }> = ({ strings }) => {
  if (strings.length === 0) return null;

  return <div className={baseStyles['resume-text-sm']}>{strings.join(', ')}</div>;
};

export default DynamicResumeSection;
