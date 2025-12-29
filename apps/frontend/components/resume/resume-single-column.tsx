import React from 'react';
import { Mail, Phone, MapPin, Globe, Linkedin, Github } from 'lucide-react';
import type { ResumeData, SectionMeta } from '@/components/dashboard/resume-component';
import { getSortedSections } from '@/lib/utils/section-helpers';
import { DynamicResumeSection } from './dynamic-resume-section';

interface ResumeSingleColumnProps {
  data: ResumeData;
  showContactIcons?: boolean;
}

/**
 * Swiss Single-Column Resume Template
 *
 * Traditional full-width layout with sections stacked vertically.
 * Best for detailed experience descriptions and maximum content density.
 *
 * Section order: Determined by sectionMeta ordering
 */
export const ResumeSingleColumn: React.FC<ResumeSingleColumnProps> = ({
  data,
  showContactIcons = false,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, additional } = data;

  // Get sorted visible sections
  const sortedSections = getSortedSections(data);

  // Get section display name from metadata
  const getSectionDisplayName = (sectionKey: string): string => {
    const section = sortedSections.find((s) => s.key === sectionKey);
    return section?.displayName || sectionKey;
  };

  // Icon mapping for contact types
  const contactIcons: Record<string, React.ReactNode> = {
    Email: <Mail size={12} />,
    Phone: <Phone size={12} />,
    Location: <MapPin size={12} />,
    Website: <Globe size={12} />,
    LinkedIn: <Linkedin size={12} />,
    GitHub: <Github size={12} />,
  };

  // Helper function to render contact details
  const renderContactDetail = (label: string, value?: string, hrefPrefix: string = '') => {
    if (!value) return null;

    let finalHrefPrefix = hrefPrefix;
    if (
      ['Website', 'LinkedIn', 'GitHub'].includes(label) &&
      !value.startsWith('http') &&
      !value.startsWith('//')
    ) {
      finalHrefPrefix = 'https://';
    }

    const href = finalHrefPrefix + value;
    const isLink =
      finalHrefPrefix.startsWith('http') ||
      finalHrefPrefix.startsWith('mailto:') ||
      finalHrefPrefix.startsWith('tel:');

    let displayText = value;
    if (isLink && (label === 'LinkedIn' || label === 'GitHub' || label === 'Website')) {
      displayText = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
    }

    return (
      <span className="inline-flex items-center gap-1">
        {showContactIcons && contactIcons[label]}
        {isLink ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline text-black"
          >
            {displayText}
          </a>
        ) : (
          <span className="text-black">{displayText}</span>
        )}
      </span>
    );
  };

  // Render a section based on its key
  const renderSection = (section: SectionMeta) => {
    switch (section.key) {
      case 'personalInfo':
        // Personal info is the header - handled separately
        return null;

      case 'summary':
        if (!summary) return null;
        return (
          <div key={section.id} className="resume-section">
            <h3 className="resume-section-title">{section.displayName}</h3>
            <p className="text-justify resume-text text-gray-800">{summary}</p>
          </div>
        );

      case 'workExperience':
        if (!workExperience || workExperience.length === 0) return null;
        return (
          <div key={section.id} className="resume-section">
            <h3 className="resume-section-title">{section.displayName}</h3>
            <div className="resume-items">
              {workExperience.map((exp) => (
                <div key={exp.id} className="resume-item">
                  <div className="flex justify-between items-baseline resume-row-tight">
                    <h4 className="resume-item-title">{exp.title}</h4>
                    <span className="resume-meta-sm text-gray-600 shrink-0 ml-4">{exp.years}</span>
                  </div>
                  <div className="flex justify-between items-center resume-row resume-meta text-gray-700">
                    <span>{exp.company}</span>
                    {exp.location && <span>{exp.location}</span>}
                  </div>
                  {exp.description && exp.description.length > 0 && (
                    <ul className="list-disc list-outside ml-4 resume-list resume-text-sm text-gray-800">
                      {exp.description.map((desc, index) => (
                        <li key={index} className="pl-1">
                          {desc}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'personalProjects':
        if (!personalProjects || personalProjects.length === 0) return null;
        return (
          <div key={section.id} className="resume-section">
            <h3 className="resume-section-title">{section.displayName}</h3>
            <div className="resume-items">
              {personalProjects.map((project) => (
                <div key={project.id} className="resume-item">
                  <div className="flex justify-between items-baseline resume-row-tight">
                    <h4 className="resume-item-title">{project.name}</h4>
                    <span className="resume-meta-sm text-gray-600 shrink-0 ml-4">{project.years}</span>
                  </div>
                  {project.role && (
                    <p className="resume-meta text-gray-700 resume-row">{project.role}</p>
                  )}
                  {project.description && project.description.length > 0 && (
                    <ul className="list-disc list-outside ml-4 resume-list resume-text-sm text-gray-800">
                      {project.description.map((desc, index) => (
                        <li key={index} className="pl-1">
                          {desc}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'education':
        if (!education || education.length === 0) return null;
        return (
          <div key={section.id} className="resume-section">
            <h3 className="resume-section-title">{section.displayName}</h3>
            <div className="resume-items">
              {education.map((edu) => (
                <div key={edu.id} className="resume-item">
                  <div className="flex justify-between items-baseline resume-row-tight">
                    <h4 className="resume-item-title">{edu.institution}</h4>
                    <span className="resume-meta-sm text-gray-600 shrink-0 ml-4">{edu.years}</span>
                  </div>
                  <div className="flex justify-between resume-meta text-gray-700 resume-row-tight">
                    <span>{edu.degree}</span>
                  </div>
                  {edu.description && (
                    <p className="resume-text-sm text-gray-800">{edu.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'additional':
        if (!additional) return null;
        return <AdditionalSection key={section.id} additional={additional} displayName={section.displayName} />;

      default:
        // Custom section - render using DynamicResumeSection
        if (!section.isDefault) {
          return <DynamicResumeSection key={section.id} sectionMeta={section} resumeData={data} />;
        }
        return null;
    }
  };

  return (
    <>
      {/* Header Section - Centered Layout (always first) */}
      {personalInfo && (
        <header className="text-center resume-header border-b-2 border-black">
          {/* Name - Centered */}
          {personalInfo.name && (
            <h1 className="resume-name tracking-tight uppercase mb-1">{personalInfo.name}</h1>
          )}

          {/* Title - Centered, below name */}
          {personalInfo.title && (
            <h2 className="resume-title resume-meta text-gray-700 tracking-wide uppercase mb-3">
              {personalInfo.title}
            </h2>
          )}

          {/* Contact - Own line, centered */}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 resume-meta text-gray-600">
            {renderContactDetail('Email', personalInfo.email, 'mailto:')}
            {personalInfo.phone && (
              <>
                <span className="text-gray-400">|</span>
                {renderContactDetail('Phone', personalInfo.phone, 'tel:')}
              </>
            )}
            {personalInfo.location && (
              <>
                <span className="text-gray-400">|</span>
                {renderContactDetail('Location', personalInfo.location)}
              </>
            )}
            {personalInfo.website && (
              <>
                <span className="text-gray-400">|</span>
                {renderContactDetail('Website', personalInfo.website)}
              </>
            )}
            {personalInfo.linkedin && (
              <>
                <span className="text-gray-400">|</span>
                {renderContactDetail('LinkedIn', personalInfo.linkedin)}
              </>
            )}
            {personalInfo.github && (
              <>
                <span className="text-gray-400">|</span>
                {renderContactDetail('GitHub', personalInfo.github)}
              </>
            )}
          </div>
        </header>
      )}

      {/* Render sections in order based on sectionMeta */}
      {sortedSections
        .filter((section) => section.key !== 'personalInfo')
        .map((section) => renderSection(section))}
    </>
  );
};

/**
 * Additional info section (skills, languages, certifications, awards)
 */
const AdditionalSection: React.FC<{
  additional: ResumeData['additional'];
  displayName?: string;
}> = ({ additional, displayName = 'Skills & Awards' }) => {
  if (!additional) return null;

  const {
    technicalSkills = [],
    languages = [],
    certificationsTraining = [],
    awards = [],
  } = additional;

  const hasContent =
    technicalSkills.length > 0 ||
    languages.length > 0 ||
    certificationsTraining.length > 0 ||
    awards.length > 0;

  if (!hasContent) return null;

  return (
    <div className="resume-section">
      <h3 className="resume-section-title">{displayName}</h3>
      <div className="resume-stack resume-text-sm">
        {technicalSkills.length > 0 && (
          <div className="flex">
            <span className="font-bold w-32 shrink-0">Technical Skills:</span>
            <span className="text-gray-800">{technicalSkills.join(', ')}</span>
          </div>
        )}
        {languages.length > 0 && (
          <div className="flex">
            <span className="font-bold w-32 shrink-0">Languages:</span>
            <span className="text-gray-800">{languages.join(', ')}</span>
          </div>
        )}
        {certificationsTraining.length > 0 && (
          <div className="flex">
            <span className="font-bold w-32 shrink-0">Certifications:</span>
            <span className="text-gray-800">{certificationsTraining.join(', ')}</span>
          </div>
        )}
        {awards.length > 0 && (
          <div className="flex">
            <span className="font-bold w-32 shrink-0">Awards:</span>
            <span className="text-gray-800">{awards.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumeSingleColumn;
