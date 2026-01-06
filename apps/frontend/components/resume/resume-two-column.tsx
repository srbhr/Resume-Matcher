import React from 'react';
import { Mail, Phone, MapPin, Globe, Linkedin, Github, ExternalLink } from 'lucide-react';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { getSortedSections } from '@/lib/utils/section-helpers';
import { DynamicResumeSection } from './dynamic-resume-section';
import { SafeHtml } from './safe-html';
import baseStyles from './styles/_base.module.css';
import styles from './styles/swiss-two-column.module.css';

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
 * Main Column (62%): Experience, Projects, Certifications/Training, Custom Sections
 * Sidebar (38%): Summary, Education, Skills, Languages, Awards
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
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${baseStyles['resume-link']} hover:underline`}
          >
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
        <header
          className={`text-center ${baseStyles['resume-header']} border-b`}
          style={{ borderColor: 'var(--resume-border-primary)' }}
        >
          {/* Name - Centered */}
          {personalInfo.name && (
            <h1 className={`${baseStyles['resume-name']} tracking-tight uppercase mb-1`}>
              {personalInfo.name}
            </h1>
          )}

          {/* Title - Centered, below name */}
          {personalInfo.title && (
            <h2
              className={`${baseStyles['resume-title']} ${baseStyles['resume-meta']} tracking-wide uppercase mb-3`}
            >
              {personalInfo.title}
            </h2>
          )}

          {/* Contact - Own line, centered */}
          <div
            className={`flex flex-wrap justify-center gap-x-3 gap-y-1 ${baseStyles['resume-meta']}`}
          >
            {personalInfo.email && renderContactDetail('Email', personalInfo.email, 'mailto:')}
            {personalInfo.phone && (
              <>
                <span className={baseStyles['text-muted']}>|</span>
                {renderContactDetail('Phone', personalInfo.phone, 'tel:')}
              </>
            )}
            {personalInfo.location && (
              <>
                <span className={baseStyles['text-muted']}>|</span>
                {renderContactDetail('Location', personalInfo.location)}
              </>
            )}
            {personalInfo.website && (
              <>
                <span className={baseStyles['text-muted']}>|</span>
                {renderContactDetail('Website', personalInfo.website)}
              </>
            )}
            {personalInfo.linkedin && (
              <>
                <span className={baseStyles['text-muted']}>|</span>
                {renderContactDetail('LinkedIn', personalInfo.linkedin)}
              </>
            )}
            {personalInfo.github && (
              <>
                <span className={baseStyles['text-muted']}>|</span>
                {renderContactDetail('GitHub', personalInfo.github)}
              </>
            )}
          </div>
        </header>
      )}

      {/* Two Column Layout - items-start ensures content aligns top while grid maintains equal row height */}
      <div className={styles.grid}>
        {/* Main Column - Left */}
        <div className={styles.mainColumn}>
          {/* Experience Section */}
          {isSectionVisible('workExperience') && workExperience && workExperience.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title']}>
                {getSectionDisplayName('workExperience', 'Experience')}
              </h3>
              <div className={baseStyles['resume-items']}>
                {workExperience.map((exp) => (
                  <div key={exp.id} className={baseStyles['resume-item']}>
                    <div
                      className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}
                    >
                      <h4 className={baseStyles['resume-item-title-sm']}>{exp.title}</h4>
                      <span className={`${baseStyles['resume-date']} ml-2`}>{exp.years}</span>
                    </div>

                    <div
                      className={`flex justify-between items-center ${baseStyles['resume-row-tight']} ${baseStyles['resume-meta-sm']}`}
                    >
                      <span>{exp.company}</span>
                      {exp.location && <span>{exp.location}</span>}
                    </div>

                    {exp.description && exp.description.length > 0 && (
                      <ul
                        className={`list-disc list-outside ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-xs']}`}
                      >
                        {exp.description.map((desc, index) => (
                          <li key={index} className="pl-0.5">
                            <SafeHtml html={desc} />
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
          {isSectionVisible('personalProjects') &&
            personalProjects &&
            personalProjects.length > 0 && (
              <div className={baseStyles['resume-section']}>
                <h3 className={baseStyles['resume-section-title']}>
                  {getSectionDisplayName('personalProjects', 'Projects')}
                </h3>
                <div className={baseStyles['resume-items']}>
                  {personalProjects.map((project) => (
                    <div key={project.id} className={baseStyles['resume-item']}>
                      <div
                        className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}
                      >
                        <h4 className={baseStyles['resume-item-title-sm']}>{project.name}</h4>
                        {project.years && (
                          <span className={`${baseStyles['resume-date']} ml-2`}>
                            {project.years}
                          </span>
                        )}
                      </div>
                      {(project.role || project.github || project.website) && (
                        <div
                          className={`flex justify-between items-center ${baseStyles['resume-row-tight']} ${baseStyles['resume-meta-sm']}`}
                        >
                          {project.role && <span>{project.role}</span>}
                          {(project.github || project.website) && (
                            <span className="flex gap-2">
                              {project.github && (
                                <a
                                  href={
                                    project.github.startsWith('http')
                                      ? project.github
                                      : `https://${project.github}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={baseStyles['resume-link-pill']}
                                >
                                  <Github size={10} />
                                  GitHub
                                </a>
                              )}
                              {project.website && (
                                <a
                                  href={
                                    project.website.startsWith('http')
                                      ? project.website
                                      : `https://${project.website}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={baseStyles['resume-link-pill']}
                                >
                                  <ExternalLink size={10} />
                                  Website
                                </a>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                      {project.description && project.description.length > 0 && (
                        <ul
                          className={`list-disc list-outside ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-xs']}`}
                        >
                          {project.description.map((desc, index) => (
                            <li key={index} className="pl-0.5">
                              <SafeHtml html={desc} />
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
          {isSectionVisible('additional') &&
            additional?.certificationsTraining &&
            additional.certificationsTraining.length > 0 && (
              <div className={baseStyles['resume-section']}>
                <h3 className={baseStyles['resume-section-title']}>Training & Certifications</h3>
                <ul
                  className={`list-disc list-outside ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-xs']}`}
                >
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
        <div className={styles.sidebarColumn}>
          {/* Summary Section */}
          {isSectionVisible('summary') && summary && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title-sm']}>
                {getSectionDisplayName('summary', 'Summary')}
              </h3>
              <p className={baseStyles['resume-text-xs']}>{summary}</p>
            </div>
          )}

          {/* Education Section */}
          {isSectionVisible('education') && education && education.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title-sm']}>
                {getSectionDisplayName('education', 'Education')}
              </h3>
              <div className={baseStyles['resume-stack']}>
                {education.map((edu) => (
                  <div key={edu.id}>
                    <h4
                      className={`${baseStyles['resume-item-title-sm']} ${baseStyles['sidebar-text-wrap']}`}
                    >
                      {edu.institution}
                    </h4>
                    <p className={baseStyles['resume-meta-sm']}>{edu.degree}</p>
                    <p className={`${baseStyles['resume-date']} ${baseStyles['text-muted']}`}>
                      {edu.years}
                    </p>
                    {edu.description && (
                      <p className={`${baseStyles['resume-text-xs']} ${baseStyles['resume-meta']}`}>
                        {edu.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills Section */}
          {isSectionVisible('additional') &&
            additional?.technicalSkills &&
            additional.technicalSkills.length > 0 && (
              <div className={baseStyles['resume-section']}>
                <h3 className={baseStyles['resume-section-title-sm']}>Skills</h3>
                <div className="flex flex-wrap gap-1">
                  {additional.technicalSkills.map((skill, index) => (
                    <span key={index} className={baseStyles['resume-skill-pill']}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

          {/* Languages Section */}
          {isSectionVisible('additional') &&
            additional?.languages &&
            additional.languages.length > 0 && (
              <div className={baseStyles['resume-section']}>
                <h3 className={baseStyles['resume-section-title-sm']}>Languages</h3>
                <p className={baseStyles['resume-text-xs']}>{additional.languages.join(' • ')}</p>
              </div>
            )}

          {/* Awards Section */}
          {isSectionVisible('additional') && additional?.awards && additional.awards.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title-sm']}>Awards</h3>
              <ul className={baseStyles['resume-list']}>
                {additional.awards.map((award, index) => (
                  <li key={index} className={baseStyles['resume-text-xs']}>
                    {award}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Links Section */}
          {personalInfo &&
            (personalInfo.website || personalInfo.linkedin || personalInfo.github) && (
              <div className={baseStyles['resume-section']}>
                <h3 className={baseStyles['resume-section-title-sm']}>Links</h3>
                <div
                  className={`${baseStyles['resume-stack-tight']} ${baseStyles['resume-meta-sm']}`}
                >
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
