import React from 'react';
import { Mail, Phone, MapPin, Globe, Linkedin, Github, ExternalLink } from 'lucide-react';
import type { ResumeData, ResumeSectionHeadings } from '@/components/dashboard/resume-component';
import { getSortedSections, getSectionMeta } from '@/lib/utils/section-helpers';
import { formatDateRange } from '@/lib/utils';
import { DynamicResumeSection } from './dynamic-resume-section';
import { SafeHtml } from './safe-html';
import baseStyles from './styles/_base.module.css';
import styles from './styles/swiss-two-column.module.css';

interface ResumeTwoColumnProps {
  data: ResumeData;
  showContactIcons?: boolean;
  sectionHeadings?: Partial<ResumeSectionHeadings>;
}

/**
 * Swiss Two-Column Resume Template
 *
 * Two-column layout with experience-focused main column (left) and
 * supporting information sidebar (right).
 *
 * Main Column (62%): Summary, Experience, Projects, Certifications/Training, Custom Sections
 * Sidebar (38%): Education, Skills, Languages, Awards
 *
 * Best for technical roles with many projects, optimized for one-page resumes.
 */
export const ResumeTwoColumn: React.FC<ResumeTwoColumnProps> = ({
  data,
  showContactIcons = false,
  sectionHeadings,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, additional } = data;

  const groupedEducation = Array.from(
    (education ?? []).reduce((map, edu) => {
      const key = (edu.institution ?? '').trim().toLowerCase();
      if (!map.has(key)) map.set(key, { institution: edu.institution, entries: [] });
      map.get(key)!.entries.push(edu);
      return map;
    }, new Map<string, { institution: string | undefined; entries: NonNullable<typeof education> }>())
  );

  // Get sorted visible sections
  const sortedSections = getSortedSections(data);

  // Get all sections (including hidden) for visibility checks
  const allSections = getSectionMeta(data);

  const headingFallbacks: ResumeSectionHeadings = {
    summary: sectionHeadings?.summary ?? 'Summary',
    experience: sectionHeadings?.experience ?? 'Experience',
    education: sectionHeadings?.education ?? 'Education',
    projects: sectionHeadings?.projects ?? 'Projects',
    certifications: sectionHeadings?.certifications ?? 'Training & Certifications',
    skills: sectionHeadings?.skills ?? 'Skills',
    languages: sectionHeadings?.languages ?? 'Languages',
    awards: sectionHeadings?.awards ?? 'Awards',
    links: sectionHeadings?.links ?? 'Links',
  };

  // Get section display name from metadata
  const getSectionDisplayName = (sectionKey: string, fallback: string): string => {
    const section = sortedSections.find((s) => s.key === sectionKey);
    return section?.displayName || fallback;
  };

  // Check if a section is visible (use allSections, not sortedSections)
  const isSectionVisible = (sectionKey: string): boolean => {
    const section = allSections.find((s) => s.key === sectionKey);
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
    ORCID: <ExternalLink size={12} />,
  };

  // Helper function to render contact details
  const renderContactDetail = (label: string, value?: string, hrefPrefix: string = '') => {
    if (!value) return null;

    let href = '';
    let displayText: string = value;
    let isLink = false;

    if (label === 'LinkedIn') {
      const clean = value.replace(/^https?:\/\/(?:www\.)?/, '');
      href = clean.includes('linkedin.com')
        ? `https://${clean}`
        : `https://linkedin.com/in/${clean}`;
      const match = href.match(/linkedin\.com\/in\/([^/?#\s]+)/);
      displayText = match ? match[1] : clean;
      isLink = true;
    } else if (label === 'GitHub') {
      const clean = value.replace(/^https?:\/\/(?:www\.)?/, '');
      href = clean.includes('github.com') ? `https://${clean}` : `https://github.com/${clean}`;
      const match = href.match(/github\.com\/([^/?#\s]+)/);
      displayText = match ? match[1] : clean;
      isLink = true;
    } else if (label === 'ORCID') {
      const cleanId = value
        .replace(/^https?:\/\/(?:www\.)?orcid\.org\//, '')
        .replace(/^orcid\.org\//, '');
      href = `https://orcid.org/${cleanId}`;
      displayText = `orcid.org/${cleanId}`;
      isLink = true;
    } else {
      let finalHrefPrefix = hrefPrefix;
      if (label === 'Website' && !value.startsWith('http') && !value.startsWith('//')) {
        finalHrefPrefix = 'https://';
      }
      href = finalHrefPrefix + value;
      isLink = href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:');
      if (label === 'Website' && isLink) {
        displayText = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
      }
    }

    // Profile identity links always show their icon; contact details respect showContactIcons
    const showIcon = ['Website', 'LinkedIn', 'GitHub', 'ORCID'].includes(label) || showContactIcons;

    return (
      <span className="inline-flex items-center gap-1">
        {showIcon && contactIcons[label]}
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
            <h1 className={`${baseStyles['resume-name']} tracking-tight mb-1`}>
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

          {/* Contact row 1: Email, Phone, Location */}
          <div
            className={`flex flex-wrap justify-center gap-x-1 gap-y-1 ${baseStyles['resume-meta']}`}
          >
            {personalInfo.email && renderContactDetail('Email', personalInfo.email, 'mailto:')}
            {personalInfo.phone && (
              <>
                <span className={baseStyles['text-muted']}>,</span>
                {renderContactDetail('Phone', personalInfo.phone, 'tel:')}
              </>
            )}
            {personalInfo.location && (
              <>
                <span className={baseStyles['text-muted']}>,</span>
                {renderContactDetail('Location', personalInfo.location)}
              </>
            )}
            {personalInfo.links && (
              <>
                <span className={baseStyles['text-muted']}>,</span>
                <span>{personalInfo.links}</span>
              </>
            )}
          </div>

          {/* Contact row 2: Website, LinkedIn, GitHub, ORCID */}
          {(personalInfo.website ||
            personalInfo.linkedin ||
            personalInfo.github ||
            personalInfo.orcid) && (
            <div
              className={`flex flex-wrap justify-center gap-x-1 gap-y-1 mt-1 ${baseStyles['resume-meta']}`}
            >
              {renderContactDetail('Website', personalInfo.website)}
              {personalInfo.linkedin && (
                <>
                  {personalInfo.website && <span className={baseStyles['text-muted']}>,</span>}
                  {renderContactDetail('LinkedIn', personalInfo.linkedin)}
                </>
              )}
              {personalInfo.github && (
                <>
                  {(personalInfo.website || personalInfo.linkedin) && (
                    <span className={baseStyles['text-muted']}>,</span>
                  )}
                  {renderContactDetail('GitHub', personalInfo.github)}
                </>
              )}
              {personalInfo.orcid && (
                <>
                  {(personalInfo.website || personalInfo.linkedin || personalInfo.github) && (
                    <span className={baseStyles['text-muted']}>,</span>
                  )}
                  {renderContactDetail('ORCID', personalInfo.orcid)}
                </>
              )}
            </div>
          )}
        </header>
      )}

      {/* Two Column Layout - items-start ensures content aligns top while grid maintains equal row height */}
      <div className={styles.grid}>
        {/* Main Column - Left */}
        <div className={styles.mainColumn}>
          {/* Summary Section */}
          {isSectionVisible('summary') && summary && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title']}>
                {getSectionDisplayName('summary', headingFallbacks.summary)}
              </h3>
              <p className={`text-justify ${baseStyles['resume-text-sm']}`}>{summary}</p>
            </div>
          )}

          {/* Experience Section */}
          {isSectionVisible('workExperience') && workExperience && workExperience.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title']}>
                {getSectionDisplayName('workExperience', headingFallbacks.experience)}
              </h3>
              <div className={baseStyles['resume-items']}>
                {workExperience.map((exp) => (
                  <div key={exp.id} className={baseStyles['resume-item']}>
                    <div
                      className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}
                    >
                      <h4 className={baseStyles['resume-item-title-sm']}>{exp.title}</h4>
                      {exp.years && (
                        <span className={`${baseStyles['resume-date']} ml-2`}>
                          {formatDateRange(exp.years)}
                        </span>
                      )}
                    </div>

                    <div
                      className={`flex justify-between items-center ${baseStyles['resume-row-tight']} ${baseStyles['resume-item-subtitle-sm']}`}
                    >
                      <span>
                        {exp.company}
                        {exp.location && <> • {exp.location}</>}
                      </span>
                    </div>

                    {exp.description && exp.description.length > 0 && (
                      <ul
                        className={`ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-xs']}`}
                      >
                        {exp.description.map((desc, index) => (
                          <li key={index} className="flex">
                            <span className="mr-1.5 flex-shrink-0">•&nbsp;</span>
                            <span>
                              <SafeHtml html={desc} />
                            </span>
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
                  {getSectionDisplayName('personalProjects', headingFallbacks.projects)}
                </h3>
                <div className={baseStyles['resume-items']}>
                  {personalProjects.map((project) => (
                    <div key={project.id} className={baseStyles['resume-item']}>
                      <div
                        className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}
                      >
                        <div className="flex items-baseline gap-1.5">
                          <h4 className={baseStyles['resume-item-title-sm']}>{project.name}</h4>
                          {(project.github || project.website) && (
                            <span className="flex gap-1">
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
                                  <Github size={9} />
                                  {project.github
                                    .replace(/^https?:\/\//, '')
                                    .replace(/^www\./, '')
                                    .replace(/\/$/, '')}
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
                                  <ExternalLink size={9} />
                                  {project.website
                                    .replace(/^https?:\/\//, '')
                                    .replace(/^www\./, '')
                                    .replace(/\/$/, '')}
                                </a>
                              )}
                            </span>
                          )}
                        </div>
                        {project.years && (
                          <span className={`${baseStyles['resume-date']} ml-2`}>
                            {formatDateRange(project.years)}
                          </span>
                        )}
                      </div>
                      {project.role && (
                        <div
                          className={`${baseStyles['resume-row-tight']} ${baseStyles['resume-item-subtitle-sm']}`}
                        >
                          <span>{project.role}</span>
                        </div>
                      )}
                      {project.description && project.description.length > 0 && (
                        <ul
                          className={`ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-xs']}`}
                        >
                          {project.description.map((desc, index) => (
                            <li key={index} className="flex">
                              <span className="mr-1.5 flex-shrink-0">•&nbsp;</span>
                              <span>
                                <SafeHtml html={desc} />
                              </span>
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
                <h3 className={baseStyles['resume-section-title']}>
                  {headingFallbacks.certifications}
                </h3>
                <ul className={`ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-xs']}`}>
                  {additional.certificationsTraining.map((cert, index) => (
                    <li key={index} className="flex">
                      <span className="mr-1.5 flex-shrink-0">•&nbsp;</span>
                      <span>{cert}</span>
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
          {/* Education Section */}
          {isSectionVisible('education') && education && education.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title-sm']}>
                {getSectionDisplayName('education', headingFallbacks.education)}
              </h3>
              <div className={baseStyles['resume-stack']}>
                {groupedEducation.map(([key, group]) => (
                  <div key={key}>
                    <h4
                      className={`${baseStyles['resume-item-title-sm']} ${baseStyles['sidebar-text-wrap']}`}
                    >
                      {group.institution}
                    </h4>
                    {group.entries.map((edu) => (
                      <div key={edu.id}>
                        <p className={baseStyles['resume-item-subtitle-sm']}>
                          {edu.degree}
                          {edu.years && (
                            <span
                              className={`font-normal ${baseStyles['resume-date']} ${baseStyles['text-muted']}`}
                            >
                              {' '}
                              | {formatDateRange(edu.years)}
                            </span>
                          )}
                        </p>
                        {edu.description && (
                          <p
                            className={`${baseStyles['resume-text-xs']} ${baseStyles['resume-meta']}`}
                          >
                            {edu.description}
                          </p>
                        )}
                      </div>
                    ))}
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
                <h3 className={baseStyles['resume-section-title-sm']}>{headingFallbacks.skills}</h3>
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
                <h3 className={baseStyles['resume-section-title-sm']}>
                  {headingFallbacks.languages}
                </h3>
                <p className={baseStyles['resume-text-xs']}>{additional.languages.join(' • ')}</p>
              </div>
            )}

          {/* Awards Section */}
          {isSectionVisible('additional') && additional?.awards && additional.awards.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title-sm']}>{headingFallbacks.awards}</h3>
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
          {personalInfo && (personalInfo.links || personalInfo.orcid) && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title-sm']}>{headingFallbacks.links}</h3>
              <div
                className={`${baseStyles['resume-stack-tight']} ${baseStyles['resume-meta-sm']}`}
              >
                {personalInfo.links && (
                  <div>
                    <span>{personalInfo.links}</span>
                  </div>
                )}
                {personalInfo.orcid && (
                  <div>
                    <a
                      href={`https://orcid.org/${personalInfo.orcid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${baseStyles['resume-link']} hover:underline`}
                    >
                      orcid.org/{personalInfo.orcid}
                    </a>
                  </div>
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
