import React from 'react';
import type { ResumeData } from '@/components/dashboard/resume-component';

interface ResumeTwoColumnProps {
  data: ResumeData;
}

/**
 * Swiss Two-Column Resume Template
 *
 * Two-column layout with experience-focused main column (left) and
 * supporting information sidebar (right).
 *
 * Main Column (65%): Experience, Projects, Certifications/Training
 * Sidebar (35%): Summary, Education, Skills, Languages, Awards
 *
 * Best for technical roles with many projects, optimized for one-page resumes.
 */
export const ResumeTwoColumn: React.FC<ResumeTwoColumnProps> = ({ data }) => {
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

    return isLink ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
        {displayText}
      </a>
    ) : (
      <span>{displayText}</span>
    );
  };

  return (
    <>
      {/* Header Section - Full Width */}
      {personalInfo && (
        <div className="resume-section border-b-2 border-black pb-[var(--item-gap)] text-center">
          {personalInfo.name && (
            <h1
              className="font-bold tracking-tight uppercase mb-1"
              style={{ fontSize: 'calc(var(--font-size-base) * var(--header-scale))' }}
            >
              {personalInfo.name}
            </h1>
          )}

          {personalInfo.title && (
            <h2 className="text-lg font-mono text-gray-700 tracking-wide uppercase mb-2">
              {personalInfo.title}
            </h2>
          )}

          {/* Contact Info - Centered Row */}
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs font-mono text-gray-600">
            {personalInfo.email && renderContactDetail('Email', personalInfo.email, 'mailto:')}
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
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-[65%_35%] gap-6 mt-[var(--section-gap)]">
        {/* Main Column - Left */}
        <div className="pr-4 border-r border-gray-200">
          {/* Experience Section */}
          {workExperience && workExperience.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title">Experience</h3>
              <div className="resume-items">
                {workExperience.map((exp) => (
                  <div key={exp.id} className="resume-item">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h4 className="text-sm font-bold">{exp.title}</h4>
                      <span className="font-mono text-[10px] text-gray-600 shrink-0 ml-2">
                        {exp.years}
                      </span>
                    </div>

                    <div className="flex justify-between items-center mb-1 font-mono text-xs text-gray-700">
                      <span>{exp.company}</span>
                      {exp.location && <span>{exp.location}</span>}
                    </div>

                    {exp.description && exp.description.length > 0 && (
                      <ul className="list-disc list-outside ml-4 space-y-0.5 text-gray-800 font-sans text-xs">
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
          {personalProjects && personalProjects.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title">Projects</h3>
              <div className="resume-items">
                {personalProjects.map((project) => (
                  <div key={project.id} className="resume-item">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h4 className="text-sm font-bold">{project.name}</h4>
                      <span className="font-mono text-[10px] text-gray-600 shrink-0 ml-2">
                        {project.years}
                      </span>
                    </div>
                    {project.role && (
                      <p className="font-mono text-xs text-gray-700 mb-1">{project.role}</p>
                    )}
                    {project.description && project.description.length > 0 && (
                      <ul className="list-disc list-outside ml-4 space-y-0.5 text-gray-800 font-sans text-xs">
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
          {additional?.certificationsTraining && additional.certificationsTraining.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title">Training & Certifications</h3>
              <ul className="list-disc list-outside ml-4 space-y-1 text-gray-800 font-sans text-xs">
                {additional.certificationsTraining.map((cert, index) => (
                  <li key={index} className="pl-0.5">
                    {cert}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sidebar Column - Right */}
        <div className="pl-2">
          {/* Summary Section */}
          {summary && (
            <div className="resume-section">
              <h3 className="resume-section-title-sm">Summary</h3>
              <p className="text-xs text-gray-800 font-sans leading-relaxed">{summary}</p>
            </div>
          )}

          {/* Education Section */}
          {education && education.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title-sm">Education</h3>
              <div className="space-y-2">
                {education.map((edu) => (
                  <div key={edu.id}>
                    <h4 className="text-xs font-bold">{edu.institution}</h4>
                    <p className="font-mono text-[10px] text-gray-700">{edu.degree}</p>
                    <p className="font-mono text-[10px] text-gray-500">{edu.years}</p>
                    {edu.description && (
                      <p className="text-[10px] text-gray-600 mt-0.5">{edu.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills Section */}
          {additional?.technicalSkills && additional.technicalSkills.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title-sm">Skills</h3>
              <div className="flex flex-wrap gap-1">
                {additional.technicalSkills.map((skill, index) => (
                  <span
                    key={index}
                    className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 border border-gray-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Languages Section */}
          {additional?.languages && additional.languages.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title-sm">Languages</h3>
              <p className="text-xs text-gray-800 font-sans">{additional.languages.join(' • ')}</p>
            </div>
          )}

          {/* Awards Section */}
          {additional?.awards && additional.awards.length > 0 && (
            <div className="resume-section">
              <h3 className="resume-section-title-sm">Awards</h3>
              <ul className="space-y-1">
                {additional.awards.map((award, index) => (
                  <li key={index} className="text-xs text-gray-800 font-sans">
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
                <div className="space-y-1 text-xs font-mono text-gray-700">
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
