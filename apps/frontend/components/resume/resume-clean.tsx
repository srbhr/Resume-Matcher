import React from 'react';
import { Mail, Phone, MapPin, Globe, Linkedin, Github, ExternalLink } from 'lucide-react';
import type {
  ResumeData,
  SectionMeta,
  AdditionalSectionLabels,
} from '@/components/dashboard/resume-component';
import { getSortedSections } from '@/lib/utils/section-helpers';
import { formatDateRange } from '@/lib/utils';
import { SafeHtml } from './safe-html';
import baseStyles from './styles/_base.module.css';
import styles from './styles/clean.module.css';

interface ResumeCleanProps {
  data: ResumeData;
  showContactIcons?: boolean;
  additionalSectionLabels?: Partial<AdditionalSectionLabels>;
}

/**
 * Clean Resume Template
 *
 * Minimal modern sans layout: centered light-weight name, a single pipe-separated
 * contact line, large understated gray UPPERCASE section headers with a thin rule,
 * and single-line entries (COMPANY | Role on the left, Location | Dates on the right).
 *
 * Single-typeface design: all text inherits `--body-font` (sans by default), so the
 * Body Font control drives the whole template. ATS-safe (all text is real DOM nodes).
 *
 * Section order: Determined by sectionMeta ordering.
 */
export const ResumeClean: React.FC<ResumeCleanProps> = ({
  data,
  showContactIcons = false,
  additionalSectionLabels,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, additional } = data;

  const sortedSections = getSortedSections(data);

  const contactIcons: Record<string, React.ReactNode> = {
    Email: <Mail size={12} />,
    Phone: <Phone size={12} />,
    Location: <MapPin size={12} />,
    Website: <Globe size={12} />,
    LinkedIn: <Linkedin size={12} />,
    GitHub: <Github size={12} />,
  };

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

  const contactItems = [
    renderContactDetail('Location', personalInfo?.location),
    renderContactDetail('Phone', personalInfo?.phone, 'tel:'),
    renderContactDetail('Email', personalInfo?.email, 'mailto:'),
    renderContactDetail('LinkedIn', personalInfo?.linkedin),
    renderContactDetail('GitHub', personalInfo?.github),
    renderContactDetail('Website', personalInfo?.website),
  ].filter(Boolean);

  // Single-line entry header: COMPANY | Role (left), Location | Dates (right).
  const renderEntryHeader = (
    primary?: string,
    role?: string,
    location?: string,
    dates?: string
  ) => {
    const meta = [location, dates ? formatDateRange(dates) : undefined].filter(Boolean).join(' | ');
    return (
      <div
        className={`flex justify-between items-baseline gap-3 ${baseStyles['resume-row-tight']}`}
      >
        <span className="min-w-0">
          <span className={styles.entryCompany}>{primary}</span>
          {role && (
            <>
              <span className={styles.sep}>|</span>
              <span className={styles.entryRole}>{role}</span>
            </>
          )}
        </span>
        {meta && <span className={styles.entryMeta}>{meta}</span>}
      </div>
    );
  };

  const renderBullets = (items?: string[]) => {
    if (!items || items.length === 0) return null;
    return (
      <ul className={`ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-sm']}`}>
        {items.map((desc, index) => (
          <li key={index} className="flex">
            <span className="mr-1.5 flex-shrink-0">•&nbsp;</span>
            <span>
              <SafeHtml html={desc} />
            </span>
          </li>
        ))}
      </ul>
    );
  };

  const renderSection = (section: SectionMeta) => {
    switch (section.key) {
      case 'personalInfo':
        return null;

      case 'summary':
        if (!summary) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={styles.sectionTitle}>{section.displayName}</h3>
            <p className={`text-justify ${baseStyles['resume-text']}`}>{summary}</p>
          </div>
        );

      case 'workExperience':
        if (!workExperience || workExperience.length === 0) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={styles.sectionTitle}>{section.displayName}</h3>
            <div className={baseStyles['resume-items']}>
              {workExperience.map((exp) => (
                <div key={exp.id} className={baseStyles['resume-item']}>
                  {renderEntryHeader(exp.company, exp.title, exp.location, exp.years)}
                  {renderBullets(exp.description)}
                </div>
              ))}
            </div>
          </div>
        );

      case 'personalProjects':
        if (!personalProjects || personalProjects.length === 0) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={styles.sectionTitle}>{section.displayName}</h3>
            <div className={baseStyles['resume-items']}>
              {personalProjects.map((project) => (
                <div key={project.id} className={baseStyles['resume-item']}>
                  <div
                    className={`flex justify-between items-baseline gap-3 ${baseStyles['resume-row-tight']}`}
                  >
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className={styles.entryCompany}>{project.name}</span>
                      {project.role && (
                        <>
                          <span className={styles.sep}>|</span>
                          <span className={styles.entryRole}>{project.role}</span>
                        </>
                      )}
                      {(project.github || project.website) && (
                        <span className="flex gap-1.5">
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
                              <ExternalLink size={10} />
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
                      <span className={styles.entryMeta}>{formatDateRange(project.years)}</span>
                    )}
                  </div>
                  {renderBullets(project.description)}
                </div>
              ))}
            </div>
          </div>
        );

      case 'education':
        if (!education || education.length === 0) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={styles.sectionTitle}>{section.displayName}</h3>
            <div className={baseStyles['resume-items']}>
              {education.map((edu) => (
                <div key={edu.id} className={baseStyles['resume-item']}>
                  {renderEntryHeader(edu.institution, edu.degree, undefined, edu.years)}
                  {edu.description && (
                    <p className={baseStyles['resume-text-sm']}>{edu.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'additional':
        if (!additional) return null;
        return (
          <AdditionalSection
            key={section.id}
            additional={additional}
            displayName={section.displayName}
            labels={additionalSectionLabels}
          />
        );

      default:
        if (!section.isDefault) {
          return (
            <DynamicResumeSectionClean
              key={section.id}
              sectionMeta={section}
              resumeData={data}
              renderBullets={renderBullets}
              renderEntryHeader={renderEntryHeader}
            />
          );
        }
        return null;
    }
  };

  return (
    <div className={styles.container}>
      {personalInfo && (
        <header className={`text-center ${baseStyles['resume-header']}`}>
          {personalInfo.name && <h1 className={`${styles.name} mb-1`}>{personalInfo.name}</h1>}
          {personalInfo.title && (
            <div className={`${styles.tagline} mb-1`}>{personalInfo.title}</div>
          )}
          {contactItems.length > 0 && (
            <div
              className={`flex flex-wrap justify-center items-center gap-x-2 gap-y-1 ${styles.contactRow}`}
            >
              {contactItems.map((item, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span className={styles.sep}>|</span>}
                  {item}
                </React.Fragment>
              ))}
            </div>
          )}
        </header>
      )}

      {sortedSections
        .filter((section) => section.key !== 'personalInfo')
        .map((section) => renderSection(section))}
    </div>
  );
};

/**
 * Additional info section (skills, languages, certifications, awards).
 * Bold inline label followed by comma-joined items, one line per category.
 */
const AdditionalSection: React.FC<{
  additional: ResumeData['additional'];
  displayName?: string;
  labels?: Partial<AdditionalSectionLabels>;
}> = ({ additional, displayName = 'Skills & Awards', labels }) => {
  if (!additional) return null;

  const clean = (items?: string[]) =>
    (items ?? []).filter((item): item is string => typeof item === 'string' && item.trim() !== '');

  const technicalSkills = clean(additional.technicalSkills);
  const languages = clean(additional.languages);
  const certificationsTraining = clean(additional.certificationsTraining);
  const awards = clean(additional.awards);

  const mergedLabels: AdditionalSectionLabels = {
    technicalSkills: labels?.technicalSkills ?? 'Technical Skills:',
    languages: labels?.languages ?? 'Languages:',
    certifications: labels?.certifications ?? 'Certifications:',
    awards: labels?.awards ?? 'Awards:',
  };

  const hasContent =
    technicalSkills.length > 0 ||
    languages.length > 0 ||
    certificationsTraining.length > 0 ||
    awards.length > 0;

  if (!hasContent) return null;

  const line = (label: string, items: string[]) =>
    items.length > 0 ? (
      <div>
        <span className={styles.skillLabel}>{label}</span> {items.join(', ')}
      </div>
    ) : null;

  return (
    <div className={baseStyles['resume-section']}>
      <h3 className={styles.sectionTitle}>{displayName}</h3>
      <div className={`${baseStyles['resume-stack']} ${baseStyles['resume-text-sm']}`}>
        {line(mergedLabels.technicalSkills, technicalSkills)}
        {line(mergedLabels.languages, languages)}
        {line(mergedLabels.certifications, certificationsTraining)}
        {line(mergedLabels.awards, awards)}
      </div>
    </div>
  );
};

/**
 * Dynamic (custom) section wrapper for the Clean template.
 */
const DynamicResumeSectionClean: React.FC<{
  sectionMeta: SectionMeta;
  resumeData: ResumeData;
  renderBullets: (items?: string[]) => React.ReactNode;
  renderEntryHeader: (
    primary?: string,
    role?: string,
    location?: string,
    dates?: string
  ) => React.ReactNode;
}> = ({ sectionMeta, resumeData, renderBullets, renderEntryHeader }) => {
  const customSection = resumeData.customSections?.[sectionMeta.key];
  if (!customSection) return null;

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
    <div className={baseStyles['resume-section']}>
      <h3 className={styles.sectionTitle}>{sectionMeta.displayName}</h3>
      {sectionMeta.sectionType === 'text' && customSection.text?.trim() && (
        <p className={`text-justify ${baseStyles['resume-text']}`}>{customSection.text}</p>
      )}
      {sectionMeta.sectionType === 'itemList' && customSection.items?.length ? (
        <div className={baseStyles['resume-items']}>
          {customSection.items.map((item) => (
            <div key={item.id} className={baseStyles['resume-item']}>
              {renderEntryHeader(item.title, item.subtitle, item.location, item.years)}
              {renderBullets(item.description)}
            </div>
          ))}
        </div>
      ) : null}
      {sectionMeta.sectionType === 'stringList' && customSection.strings?.length ? (
        <div className={baseStyles['resume-text-sm']}>{customSection.strings.join(', ')}</div>
      ) : null}
    </div>
  );
};

export default ResumeClean;
