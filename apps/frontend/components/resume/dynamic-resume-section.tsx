import React from 'react';
import type {
  ResumeData,
  SectionMeta,
  CustomSection,
  CustomSectionItem,
} from '@/components/dashboard/resume-component';

interface DynamicResumeSectionProps {
  sectionMeta: SectionMeta;
  resumeData: ResumeData;
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
}) => {
  // Get the custom section data
  const customSection = resumeData.customSections?.[sectionMeta.key];

  if (!customSection) return null;

  // Check if section has content
  const hasContent = (() => {
    switch (sectionMeta.sectionType) {
      case 'text':
        return Boolean(customSection.text?.trim());
      case 'itemList':
        return Boolean(customSection.items?.length);
      case 'stringList':
        return Boolean(customSection.strings?.length);
      default:
        return false;
    }
  })();

  if (!hasContent) return null;

  return (
    <div className="resume-section">
      <h3 className="resume-section-title">{sectionMeta.displayName}</h3>
      {renderContent(sectionMeta.sectionType, customSection)}
    </div>
  );
};

/**
 * Render section content based on type
 */
function renderContent(sectionType: SectionMeta['sectionType'], customSection: CustomSection) {
  switch (sectionType) {
    case 'text':
      return <TextSectionContent text={customSection.text || ''} />;
    case 'itemList':
      return <ItemListSectionContent items={customSection.items || []} />;
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

  return <p className="text-justify resume-text text-gray-800">{text}</p>;
};

/**
 * Item List Section Content (like Experience)
 */
const ItemListSectionContent: React.FC<{ items: CustomSectionItem[] }> = ({ items }) => {
  if (items.length === 0) return null;

  return (
    <div className="resume-items">
      {items.map((item) => (
        <div key={item.id} className="resume-item">
          {/* Title and Years Row */}
          <div className="flex justify-between items-baseline resume-row-tight">
            <h4 className="resume-item-title">{item.title}</h4>
            {item.years && (
              <span className="resume-meta-sm text-gray-600 shrink-0 ml-4">{item.years}</span>
            )}
          </div>

          {/* Subtitle and Location Row */}
          {(item.subtitle || item.location) && (
            <div className="flex justify-between items-center resume-row resume-meta text-gray-700">
              {item.subtitle && <span>{item.subtitle}</span>}
              {item.location && <span>{item.location}</span>}
            </div>
          )}

          {/* Description Points */}
          {item.description && item.description.length > 0 && (
            <ul className="list-disc list-outside ml-4 resume-list resume-text-sm text-gray-800">
              {item.description.map((desc, index) => (
                <li key={index} className="pl-1">
                  {desc}
                </li>
              ))}
            </ul>
          )}
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

  return (
    <div className="resume-text-sm text-gray-800">
      {strings.join(', ')}
    </div>
  );
};

export default DynamicResumeSection;
