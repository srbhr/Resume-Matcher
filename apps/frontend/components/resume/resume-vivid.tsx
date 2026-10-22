import React from 'react';
import { Mail, Phone, MapPin, Globe, Linkedin, Github, ExternalLink } from 'lucide-react';
import type {
  ResumeData,
  SectionMeta,
  PersonalInfo,
  Experience,
  Project,
  ResumeSectionHeadings,
  ResumeFallbackLabels,
} from '@/components/dashboard/resume-component';
import { getSortedSections, getSectionMeta } from '@/lib/utils/section-helpers';
import { formatDateRange } from '@/lib/utils';
import { DescriptionList } from './description-list';
import { EarlierExperience, splitCondensed } from './earlier-experience';
import { RESUME_SECTION, RESUME_SECTION_TITLE, resumeItem } from './page-break-attrs';
import baseStyles from './styles/_base.module.css';
import styles from './styles/vivid.module.css';
import { customSectionHasContent } from './dynamic-resume-section';

interface ResumeVividProps {
  earlierExperienceLabel?: string;
  data: ResumeData;
  showContactIcons?: boolean;
  sectionHeadings?: Partial<ResumeSectionHeadings>;
  fallbackLabels?: Partial<ResumeFallbackLabels>;
}

/** Drop empty and non-string entries from a string list. */
export const cleanItems = (items?: string[]): string[] =>
  (items ?? []).filter((item): item is string => typeof item === 'string' && item.trim() !== '');

/** Section headings with the English fallbacks used when none are passed in. */
export const getVividHeadings = (
  sectionHeadings?: Partial<ResumeSectionHeadings>
): ResumeSectionHeadings => ({
  summary: sectionHeadings?.summary ?? 'Summary',
  experience: sectionHeadings?.experience ?? 'Experience',
  education: sectionHeadings?.education ?? 'Education',
  projects: sectionHeadings?.projects ?? 'Projects',
  certifications: sectionHeadings?.certifications ?? 'Training & Certifications',
  skills: sectionHeadings?.skills ?? 'Skills',
  languages: sectionHeadings?.languages ?? 'Languages',
  awards: sectionHeadings?.awards ?? 'Awards',
  links: sectionHeadings?.links ?? 'Links',
});

const contactIcons: Record<string, React.ReactNode> = {
  Email: <Mail size={11} />,
  Phone: <Phone size={11} />,
  Location: <MapPin size={11} />,
  Website: <Globe size={11} />,
  LinkedIn: <Linkedin size={11} />,
  GitHub: <Github size={11} />,
};

export const renderContactDetail = (
  showContactIcons: boolean,
  label: string,
  value?: string,
  hrefPrefix: string = ''
) => {
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
    <span className={styles.contactChip}>
      {showContactIcons && <span className={styles.iconCircle}>{contactIcons[label]}</span>}
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

export const renderArrowBullets = (
  items?: string[],
  textClass: string = baseStyles['resume-text-xs'],
  itemStyles?: ('bullet' | 'plain')[]
) => (
  <DescriptionList
    items={items}
    styles={itemStyles}
    textClassName={textClass}
    marker="➜"
    markerClassName={`mr-1.5 ${styles.arrow}`}
  />
);

/**
 * Header: two-tone accent name, monospace title, and the contact row.
 * Two-tone name: bold accent first token, lighter accent for the rest.
 */
export const VividHeader: React.FC<{
  personalInfo?: PersonalInfo;
  showContactIcons: boolean;
  nameFallback?: string;
  nameRestClassName?: string;
}> = ({
  personalInfo,
  showContactIcons,
  nameFallback = 'Your Name',
  nameRestClassName = styles.nameRestSolid,
}) => {
  const fullName = personalInfo?.name || nameFallback;
  const firstSpace = fullName.indexOf(' ');
  const nameFirst = firstSpace === -1 ? fullName : fullName.slice(0, firstSpace);
  const nameRest = firstSpace === -1 ? '' : fullName.slice(firstSpace + 1);

  return (
    <div className={baseStyles['resume-header']}>
      <h1 className={baseStyles['resume-name']}>
        <span className={styles.nameFirst}>{nameFirst}</span>
        {nameRest && <span className={nameRestClassName}> {nameRest}</span>}
      </h1>
      {personalInfo?.title && <div className={styles.titleLine}>{personalInfo.title}</div>}
      {personalInfo && (
        <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-2 ${styles.contactRow}`}>
          {renderContactDetail(showContactIcons, 'Website', personalInfo.website)}
          {renderContactDetail(showContactIcons, 'LinkedIn', personalInfo.linkedin)}
          {renderContactDetail(showContactIcons, 'GitHub', personalInfo.github)}
          {renderContactDetail(showContactIcons, 'Email', personalInfo.email, 'mailto:')}
          {renderContactDetail(showContactIcons, 'Phone', personalInfo.phone, 'tel:')}
          {renderContactDetail(showContactIcons, 'Location', personalInfo.location)}
        </div>
      )}
    </div>
  );
};

/** One experience entry. `roleClassName` lets a layout swap the role's style. */
export const VividExperienceItem: React.FC<{ exp: Experience; roleClassName?: string }> = ({
  exp,
  roleClassName = styles.entryRoleCaps,
}) => (
  <div {...resumeItem(exp.description)} className={baseStyles['resume-item']}>
    <div className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}>
      <span>
        <span className={styles.entryCompany}>{exp.company}</span>
        {exp.title && (
          <>
            <span className={styles.entrySep}>|</span>
            <span className={roleClassName}>{exp.title}</span>
          </>
        )}
      </span>
    </div>
    <div className={`${baseStyles['resume-row-tight']} ${styles.entryMeta}`}>
      {[formatDateRange(exp.years), exp.location].filter(Boolean).join(' | ')}
    </div>
    {renderArrowBullets(exp.description, baseStyles['resume-text-xs'], exp.descriptionStyles)}
  </div>
);

/** One project entry. `roleClassName` lets a layout swap the role's style. */
export const VividProjectItem: React.FC<{ project: Project; roleClassName?: string }> = ({
  project,
  roleClassName = styles.entryRoleCaps,
}) => (
  <div {...resumeItem(project.description)} className={baseStyles['resume-item']}>
    <div className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}>
      <span className="flex items-baseline gap-1.5 min-w-0">
        <span className={styles.entryCompany}>{project.name}</span>
        {project.role && (
          <>
            <span className={styles.entrySep}>|</span>
            <span className={roleClassName}>{project.role}</span>
          </>
        )}
        {(project.github || project.website) && (
          <span className="flex gap-1">
            {project.github && (
              <a
                href={
                  project.github.startsWith('http') ? project.github : `https://${project.github}`
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
      </span>
      {project.years && (
        <span className={`${styles.entryMeta} ml-2`}>{formatDateRange(project.years)}</span>
      )}
    </div>
    {renderArrowBullets(
      project.description,
      baseStyles['resume-text-xs'],
      project.descriptionStyles
    )}
  </div>
);

/**
 * Vivid Resume Template
 *
 * Colorful two-column layout in the "Awesome-CV" lineage: a two-tone accent name,
 * a monospace title + contact row with circular icon chips, accent uppercase section
 * headers, and accent arrow (➜) bullet markers. Reads the accent-color control
 * (default blue). ATS-safe (all text is real DOM nodes).
 *
 * Main Column (63%): Summary, Experience, Projects, Certifications/Training, Custom Sections
 * Sidebar (37%): Skills, Languages, Education, Awards, Links
 */
export const ResumeVivid: React.FC<ResumeVividProps> = ({
  data,
  showContactIcons = false,
  sectionHeadings,
  fallbackLabels,
  earlierExperienceLabel,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, additional } = data;

  const technicalSkills = cleanItems(additional?.technicalSkills);
  const languages = cleanItems(additional?.languages);
  const certificationsTraining = cleanItems(additional?.certificationsTraining);
  const awards = cleanItems(additional?.awards);

  const sortedSections = getSortedSections(data);
  const allSections = getSectionMeta(data);

  const headingFallbacks = getVividHeadings(sectionHeadings);

  const getSectionDisplayName = (sectionKey: string, fallback: string): string => {
    const section = sortedSections.find((s) => s.key === sectionKey);
    return section?.displayName || fallback;
  };

  const isSectionVisible = (sectionKey: string): boolean => {
    const section = allSections.find((s) => s.key === sectionKey);
    return section?.isVisible ?? true;
  };

  const customSections = sortedSections.filter((s) => !s.isDefault);

  return (
    <>
      <VividHeader
        personalInfo={personalInfo}
        showContactIcons={showContactIcons}
        nameFallback={fallbackLabels?.name}
      />

      {/* Two-Column Grid */}
      <div className={styles.grid}>
        {/* Main Column - Left */}
        <div className={styles.mainColumn}>
          {isSectionVisible('summary') && summary && (
            <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
              <h3 {...RESUME_SECTION_TITLE} className={styles.sectionTitleCaps}>
                {getSectionDisplayName('summary', headingFallbacks.summary)}
              </h3>
              <p className={`text-justify ${baseStyles['resume-text']}`}>{summary}</p>
            </div>
          )}

          {isSectionVisible('workExperience') && workExperience && workExperience.length > 0 && (
            <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
              <h3 {...RESUME_SECTION_TITLE} className={styles.sectionTitleCaps}>
                {getSectionDisplayName('workExperience', headingFallbacks.experience)}
              </h3>
              <div className={baseStyles['resume-items']}>
                {splitCondensed(workExperience).full.map((exp) => (
                  <VividExperienceItem key={exp.id} exp={exp} />
                ))}
                {splitCondensed(workExperience).condensed.length > 0 && (
                  <EarlierExperience
                    items={splitCondensed(workExperience).condensed}
                    label={earlierExperienceLabel}
                  />
                )}
              </div>
            </div>
          )}

          {isSectionVisible('personalProjects') &&
            personalProjects &&
            personalProjects.length > 0 && (
              <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
                <h3 {...RESUME_SECTION_TITLE} className={styles.sectionTitleCaps}>
                  {getSectionDisplayName('personalProjects', headingFallbacks.projects)}
                </h3>
                <div className={baseStyles['resume-items']}>
                  {personalProjects.map((project) => (
                    <VividProjectItem key={project.id} project={project} />
                  ))}
                </div>
              </div>
            )}

          {isSectionVisible('additional') && certificationsTraining.length > 0 && (
            <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
              <h3 {...RESUME_SECTION_TITLE} className={styles.sectionTitleCaps}>
                {headingFallbacks.certifications}
              </h3>
              {renderArrowBullets(certificationsTraining)}
            </div>
          )}

          {customSections.map((section) => (
            <DynamicResumeSectionVivid key={section.id} sectionMeta={section} resumeData={data} />
          ))}
        </div>

        {/* Sidebar Column - Right */}
        <div className={styles.sidebarColumn}>
          {isSectionVisible('additional') && technicalSkills.length > 0 && (
            <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
              <h3 {...RESUME_SECTION_TITLE} className={styles.sectionTitleSm}>
                {headingFallbacks.skills}
              </h3>
              <p className={baseStyles['resume-text-xs']}>{technicalSkills.join(' • ')}</p>
            </div>
          )}

          {isSectionVisible('additional') && languages.length > 0 && (
            <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
              <h3 {...RESUME_SECTION_TITLE} className={styles.sectionTitleSm}>
                {headingFallbacks.languages}
              </h3>
              <p className={baseStyles['resume-text-xs']}>{languages.join(' • ')}</p>
            </div>
          )}

          {isSectionVisible('education') && education && education.length > 0 && (
            <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
              <h3 {...RESUME_SECTION_TITLE} className={styles.sectionTitleSm}>
                {getSectionDisplayName('education', headingFallbacks.education)}
              </h3>
              <div className={baseStyles['resume-stack']}>
                {education.map((edu) => (
                  <div key={edu.id} {...resumeItem()}>
                    <h4
                      className={`${baseStyles['resume-item-title-sm']} ${baseStyles['sidebar-text-wrap']}`}
                    >
                      {edu.institution}
                    </h4>
                    <p className={baseStyles['resume-item-subtitle-sm']}>{edu.degree}</p>
                    {edu.years && (
                      <p className={`${baseStyles['resume-meta-sm']}`}>
                        {formatDateRange(edu.years)}
                      </p>
                    )}
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

          {isSectionVisible('additional') && awards.length > 0 && (
            <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
              <h3 {...RESUME_SECTION_TITLE} className={styles.sectionTitleSm}>
                {headingFallbacks.awards}
              </h3>
              <ul className={baseStyles['resume-list']}>
                {awards.map((award, index) => (
                  <li key={index} className={baseStyles['resume-text-xs']}>
                    {award}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {personalInfo &&
            (personalInfo.website || personalInfo.linkedin || personalInfo.github) && (
              <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
                <h3 {...RESUME_SECTION_TITLE} className={styles.sectionTitleSm}>
                  {headingFallbacks.links}
                </h3>
                <div
                  className={`${baseStyles['resume-stack-tight']} ${baseStyles['resume-meta-sm']}`}
                >
                  {personalInfo.linkedin && (
                    <div>
                      {renderContactDetail(showContactIcons, 'LinkedIn', personalInfo.linkedin)}
                    </div>
                  )}
                  {personalInfo.github && (
                    <div>
                      {renderContactDetail(showContactIcons, 'GitHub', personalInfo.github)}
                    </div>
                  )}
                  {personalInfo.website && (
                    <div>
                      {renderContactDetail(showContactIcons, 'Website', personalInfo.website)}
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

/**
 * Dynamic (custom) section wrapper for the Vivid template.
 * Uses the accent uppercase section title and accent arrow bullets so custom
 * sections match the rest of the template (rather than the plain shared styling).
 */
export const DynamicResumeSectionVivid: React.FC<{
  sectionMeta: SectionMeta;
  resumeData: ResumeData;
  titleClassName?: string;
  roleClassName?: string;
}> = ({
  sectionMeta,
  resumeData,
  titleClassName = styles.sectionTitleCaps,
  roleClassName = styles.entryRoleCaps,
}) => {
  const customSection = resumeData.customSections?.[sectionMeta.key];
  if (!customSection) return null;

  if (!customSectionHasContent(sectionMeta.sectionType, customSection)) return null;

  return (
    <div {...RESUME_SECTION} className={baseStyles['resume-section']}>
      <h3 {...RESUME_SECTION_TITLE} className={titleClassName}>
        {sectionMeta.displayName}
      </h3>
      {sectionMeta.sectionType === 'text' && customSection.text?.trim() && (
        <p className={`text-justify ${baseStyles['resume-text']}`}>{customSection.text}</p>
      )}
      {sectionMeta.sectionType === 'itemList' && customSection.items?.length ? (
        <div className={baseStyles['resume-items']}>
          {customSection.items.map((item) => (
            <div
              key={item.id}
              {...resumeItem(item.description)}
              className={baseStyles['resume-item']}
            >
              <div
                className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}
              >
                <span className="min-w-0">
                  <span className={styles.entryCompany}>{item.title}</span>
                  {item.subtitle && (
                    <>
                      <span className={styles.entrySep}>|</span>
                      <span className={roleClassName}>{item.subtitle}</span>
                    </>
                  )}
                </span>
                {(item.years || item.location) && (
                  <span className={`${styles.entryMeta} ml-2`}>
                    {[formatDateRange(item.years), item.location].filter(Boolean).join(' | ')}
                  </span>
                )}
              </div>
              {renderArrowBullets(
                item.description,
                baseStyles['resume-text-xs'],
                item.descriptionStyles
              )}
            </div>
          ))}
        </div>
      ) : null}
      {sectionMeta.sectionType === 'stringList' && customSection.strings?.length ? (
        <p className={baseStyles['resume-text-xs']}>{customSection.strings.join(' • ')}</p>
      ) : null}
    </div>
  );
};

export default ResumeVivid;
