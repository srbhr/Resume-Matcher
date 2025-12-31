import React from 'react';
import { Mail, Phone, MapPin, Globe, Linkedin, Github } from 'lucide-react';
import type { ResumeData, SectionMeta } from '@/components/dashboard/resume-component';
import { getSortedSections } from '@/lib/utils/section-helpers';
import { DynamicResumeSection } from './dynamic-resume-section';

interface ResumeTwoColumnProps {
  data: ResumeData;
  showContactIcons?: boolean;
}

/**
 * Swiss Two-Column Resume Template
 *
 * Two-column layout with experience-focused main column (left) and
 * supporting information sidebar (right).
 *
 * Main Column (65%): Experience, Projects, Certifications/Training, Custom Sections
 * Sidebar (35%): Summary, Education, Skills, Languages, Awards
 *
 * Best for technical roles with many projects, optimized for one-page resumes.
 */
export const ResumeTwoColumn: React.FC<ResumeTwoColumnProps> = ({
  data,
  showContactIcons = false,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, additional } = data;

  // Get sorted visible sections
  const sortedSections = getSortedSections(data);

  // Get section display name from metadata
  const getSectionDisplayName = (sectionKey: string, fallback: string): string => {
    const section = sortedSections.find((s) => s.key === sectionKey);
    return section?.displayName || fallback;
  };

  // Check if a section is visible
  const isSectionVisible = (sectionKey: string): boolean => {
    const section = sortedSections.find((s) => s.key === sectionKey);
    return section?.isVisible ?? true;
  };

  // Get custom sections (non-default)
  const customSections = sortedSections.filter((s) => !s.isDefault);

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
          <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {displayText}
          </a>
        ) : (
          <span>{displayText}</span>
        )}
      </span>
    );
  };

  return (
    <>
      {/* Header Section - Centered Layout */}
      {personalInfo && (
        <header className="text-center resume-header border-b border-gray-400">
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
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 resume-meta text-gray-600">
            {personalInfo.email && renderContactDetail('Email', personalInfo.email, 'mailto:')}
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

      {/* Two Column Layout - items-start ensures content aligns top while grid maintains equal row height */}
      <div className="resume-two-column-grid">
        {/* Main Column - Left */}
        <div className="pr-4 border-r border-gray-200">
          {/* Experience Section */}
          {isSectionVisible('workExperience') && workExperience && workExperience.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title">{getSectionDisplayName('workExperience', 'Experience')}</h3>
              <div className="resume-items">
                {workExperience.map((exp) => (
                  <div key={exp.id} className="resume-item">
                    <div className="flex justify-between items-baseline resume-row-tight">
                      <h4 className="resume-item-title-sm">{exp.title}</h4>
                      <span className="resume-meta-sm text-gray-600 shrink-0 ml-2">
                        {exp.years}
                      </span>
                    </div>

                    <div className="flex justify-between items-center resume-row-tight resume-meta-sm text-gray-700">
                      <span>{exp.company}</span>
                      {exp.location && <span>{exp.location}</span>}
                    </div>

                    {exp.description && exp.description.length > 0 && (
                      <ul className="list-disc list-outside ml-4 resume-list resume-text-xs text-gray-800">
                        {exp.description.map((desc, index) => (
                          <li key={index} className="pl-0.5">
                            {desc}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects Section */}
          {isSectionVisible('personalProjects') && personalProjects && personalProjects.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title">{getSectionDisplayName('personalProjects', 'Projects')}</h3>
              <div className="resume-items">
            {personalProjects.map((project) => (
              <div key={project.id} className="resume-item">
                <div className="flex justify-between items-baseline resume-row-tight">
                  <h4 className="resume-item-title-sm">{project.name}</h4>
                  <span className="resume-meta-sm text-gray-600 shrink-0 ml-2">{project.years}</span>
                </div>
                {project.role && (
                  <p className="resume-meta-sm text-gray-700 resume-row-tight">{project.role}</p>
                )}
                {project.description && project.description.length > 0 && (
                  <ul className="list-disc list-outside ml-4 resume-list resume-text-xs text-gray-800">
                    {project.description.map((desc, index) => (
                      <li key={index} className="pl-0.5">
                        {desc}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certifications/Training - Main column */}
          {isSectionVisible('additional') && additional?.certificationsTraining && additional.certificationsTraining.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title">Training & Certifications</h3>
              <ul className="list-disc list-outside ml-4 resume-list resume-text-xs text-gray-800">
                {additional.certificationsTraining.map((cert, index) => (
                  <li key={index} className="pl-0.5">
                    {cert}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Custom Sections - Main column */}
          {customSections.map((section) => (
            <DynamicResumeSection key={section.id} sectionMeta={section} resumeData={data} />
          ))}
        </div>

        {/* Sidebar Column - Right */}
        <div className="pl-2">
          {/* Summary Section */}
          {isSectionVisible('summary') && summary && (
            <div className="resume-section">
              <h3 className="resume-section-title-sm">{getSectionDisplayName('summary', 'Summary')}</h3>
              <p className="resume-text-xs text-gray-800">{summary}</p>
            </div>
          )}

          {/* Education Section */}
          {isSectionVisible('education') && education && education.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title-sm">{getSectionDisplayName('education', 'Education')}</h3>
              <div className="resume-stack">
                {education.map((edu) => (
                  <div key={edu.id}>
                    <h4 className="resume-item-title-sm">{edu.institution}</h4>
                    <p className="resume-meta-sm text-gray-700">{edu.degree}</p>
                    <p className="resume-meta-sm text-gray-500">{edu.years}</p>
                    {edu.description && (
                      <p className="resume-text-xs text-gray-600">{edu.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills Section */}
          {isSectionVisible('additional') && additional?.technicalSkills && additional.technicalSkills.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title-sm">Skills</h3>
              <div className="flex flex-wrap gap-1">
                {additional.technicalSkills.map((skill, index) => (
                  <span
                    key={index}
                    className="resume-skill-pill bg-gray-100 border border-gray-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Languages Section */}
          {isSectionVisible('additional') && additional?.languages && additional.languages.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title-sm">Languages</h3>
              <p className="resume-text-xs text-gray-800">{additional.languages.join(' • ')}</p>
            </div>
          )}

          {/* Awards Section */}
          {isSectionVisible('additional') && additional?.awards && additional.awards.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title-sm">Awards</h3>
              <ul className="resume-list">
                {additional.awards.map((award, index) => (
                  <li key={index} className="resume-text-xs text-gray-800">
                    {award}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Links Section */}
          {personalInfo &&
            (personalInfo.website || personalInfo.linkedin || personalInfo.github) && (
              <div className="resume-section">
                <h3 className="resume-section-title-sm">Links</h3>
                <div className="resume-stack-tight resume-meta-sm text-gray-700">
                  {personalInfo.linkedin && (
                    <div>{renderContactDetail('LinkedIn', personalInfo.linkedin)}</div>
                  )}
                  {personalInfo.github && (
                    <div>{renderContactDetail('GitHub', personalInfo.github)}</div>
                  )}
                  {personalInfo.website && (
                    <div>{renderContactDetail('Website', personalInfo.website)}</div>
                  )}
                </div>
              </div>
            )}
        </div>
      </div>
    </>
  );
};

export default ResumeTwoColumn;
