import React from 'react';
import type { ResumeData } from '@/components/dashboard/resume-component';

interface ResumeSingleColumnProps {
  data: ResumeData;
}

/**
 * Swiss Single-Column Resume Template
 *
 * Traditional full-width layout with sections stacked vertically.
 * Best for detailed experience descriptions and maximum content density.
 *
 * Section order: Header → Summary → Experience → Projects → Education → Additional
 */
export const ResumeSingleColumn: React.FC<ResumeSingleColumnProps> = ({ data }) => {
  const { personalInfo, summary, workExperience, education, personalProjects, additional } = data;

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

  return (
    <>
      {/* Header Section */}
      {personalInfo && (
        <div className="resume-section border-b-2 border-black pb-[var(--item-gap)]">
          {personalInfo.name && (
            <h1
              className="font-bold tracking-tight uppercase mb-2"
              style={{ fontSize: 'calc(var(--font-size-base) * var(--header-scale))' }}
            >
              {personalInfo.name}
            </h1>
          )}

          <div className="flex flex-col md:flex-row md:justify-between md:items-end">
            {personalInfo.title && (
              <h2 className="text-xl font-mono text-gray-700 tracking-wide uppercase">
                {personalInfo.title}
              </h2>
            )}

            {/* Contact Grid */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono mt-4 md:mt-0 text-gray-600 justify-end">
              {renderContactDetail('Email', personalInfo.email, 'mailto:')}
              {personalInfo.phone && (
                <>
                  <span>|</span>
                  {renderContactDetail('Phone', personalInfo.phone, 'tel:')}
                </>
              )}
              {personalInfo.location && (
                <>
                  <span>|</span>
                  {renderContactDetail('Location', personalInfo.location)}
                </>
              )}
              {personalInfo.website && (
                <>
                  <span>|</span>
                  {renderContactDetail('Website', personalInfo.website)}
                </>
              )}
              {personalInfo.linkedin && (
                <>
                  <span>|</span>
                  {renderContactDetail('LinkedIn', personalInfo.linkedin)}
                </>
              )}
              {personalInfo.github && (
                <>
                  <span>|</span>
                  {renderContactDetail('GitHub', personalInfo.github)}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary Section */}
      {summary && (
        <div className="resume-section">
          <h3 className="resume-section-title">Summary</h3>
          <p className="text-justify font-sans text-gray-800">{summary}</p>
        </div>
      )}

      {/* Work Experience Section */}
      {workExperience && workExperience.length > 0 && (
        <div className="resume-section">
          <h3 className="resume-section-title">Experience</h3>
          <div className="resume-items">
            {workExperience.map((exp) => (
              <div key={exp.id} className="resume-item">
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className="text-base font-bold">{exp.title}</h4>
                  <span className="font-mono text-xs text-gray-600 shrink-0 ml-4">{exp.years}</span>
                </div>

                <div className="flex justify-between items-center mb-2 font-mono text-sm text-gray-700">
                  <span>{exp.company}</span>
                  {exp.location && <span>{exp.location}</span>}
                </div>

                {exp.description && exp.description.length > 0 && (
                  <ul className="list-disc list-outside ml-4 space-y-1 text-gray-800 font-sans text-sm">
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
      )}

      {/* Projects Section */}
      {personalProjects && personalProjects.length > 0 && (
        <div className="resume-section">
          <h3 className="resume-section-title">Projects</h3>
          <div className="resume-items">
            {personalProjects.map((project) => (
              <div key={project.id} className="resume-item">
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className="text-base font-bold">{project.name}</h4>
                  <span className="font-mono text-xs text-gray-600 shrink-0 ml-4">
                    {project.years}
                  </span>
                </div>
                {project.role && (
                  <p className="font-mono text-sm text-gray-700 mb-2">{project.role}</p>
                )}
                {project.description && project.description.length > 0 && (
                  <ul className="list-disc list-outside ml-4 space-y-1 text-gray-800 font-sans text-sm">
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
      )}

      {/* Education Section */}
      {education && education.length > 0 && (
        <div className="resume-section">
          <h3 className="resume-section-title">Education</h3>
          <div className="resume-items">
            {education.map((edu) => (
              <div key={edu.id} className="resume-item">
                <div className="flex justify-between items-baseline">
                  <h4 className="text-base font-bold">{edu.institution}</h4>
                  <span className="font-mono text-xs text-gray-600 shrink-0 ml-4">{edu.years}</span>
                </div>
                <div className="flex justify-between font-mono text-sm text-gray-700">
                  <span>{edu.degree}</span>
                </div>
                {edu.description && (
                  <p className="mt-1 text-sm text-gray-800 font-sans">{edu.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Additional Section */}
      {additional && <AdditionalSection additional={additional} />}
    </>
  );
};

/**
 * Additional info section (skills, languages, certifications, awards)
 */
const AdditionalSection: React.FC<{ additional: ResumeData['additional'] }> = ({ additional }) => {
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
      <h3 className="resume-section-title">Skills & Awards</h3>
      <div className="space-y-2 font-sans text-sm">
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
